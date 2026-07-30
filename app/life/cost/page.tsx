"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import AppLayout from "@/components/AppLayout"
import {
  getMonthData,
  getRecentMonths,
  upsertCostInfo,
  addCostItem,
  deactivateCostItem,
  deleteCostInfo,
  deleteCostItem,
  copyFromPrevMonth,
  getAllCostItems,
  updateCostItemFields,
  activateCostItem,
  getAvailableCostItems,
  addCostInfoItems,
  copyFromMonth,
  getCards,
  addCard,
  getCardMaster,
  updateCardMaster,
  revealCardSecret,
  type MonthDataRow,
  type RecentMonthSummary,
  type CostItem,
  type ManagedCostItem,
  type CardMaster,
  type CardSecretField,
} from "./actions"

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────
function fmt(n: number): string {
  return Math.round(n).toLocaleString("ko-KR")
}

const PAY_METHOD_COLOR: Record<string, string> = {
  "1": "text-emerald-600 font-medium",
  "2": "text-blue-600 font-medium",
}
function getPayMethodLabel(v: string | null) {
  if (v === "1") return "현금"
  if (v === "2") return "카드"
  return v || "-"
}

// ─────────────────────────────────────────────
// 결제수단 — cost_type(현금/카드) + card_id(어느 카드)를 드롭다운 하나로 받는다.
// 두 필드를 따로 받으면 "카드인데 카드 미선택" 불일치가 생긴다. (cost_task.md 결제수단 입력)
// ─────────────────────────────────────────────
type PayMethod = { cost_type: string | null; card_id: number | null }

function toPayMethodValue(cost_type: string | null, card_id: number | null): string {
  if (cost_type === "2") return card_id != null ? `card:${card_id}` : "card"
  if (cost_type === "1") return "cash"
  return ""
}

function fromPayMethodValue(v: string): PayMethod {
  if (v === "cash") return { cost_type: "1", card_id: null }
  if (v === "card") return { cost_type: "2", card_id: null }
  if (v.startsWith("card:")) return { cost_type: "2", card_id: Number(v.slice(5)) }
  return { cost_type: null, card_id: null }
}

/** 결제수단 표시 — 카드 결제 항목은 연결된 카드명으로. 신용카드 항목의 card_id는 자기 자신이라 제외 */
function payMethodLabel(row: {
  item_type1: string
  cost_type: string | null
  card_nm: string | null
}): string {
  if (row.cost_type !== "2") return getPayMethodLabel(row.cost_type)
  if (row.item_type1 !== "4" && row.card_nm) return row.card_nm
  return "카드"
}

/**
 * cards 가 비면 현금/카드(미지정)만 노출한다.
 * 신용카드 카테고리 항목은 카드 대금이 계좌에서 빠지므로 카드 목록을 주지 않는다.
 */
function PayMethodSelect({ value, cards, onChange, className }: {
  value: string
  cards: CardMaster[]
  onChange: (v: string) => void
  className: string
}) {
  return (
    <select className={className} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">-</option>
      <option value="cash">현금</option>
      {cards.length > 0 && (
        <optgroup label="카드">
          {cards.map(c => (
            <option key={c.id} value={`card:${c.id}`}>{c.card_nm}</option>
          ))}
        </optgroup>
      )}
      <option value="card">카드(미지정)</option>
    </select>
  )
}

const CARD_TYPE_OPTIONS = [
  { label: "신용", value: "1" },
  { label: "체크", value: "2" },
]
function getCardTypeLabel(v: string | null) {
  if (v === "1") return "신용"
  if (v === "2") return "체크"
  return "-"
}

/** 카드번호는 뒤 4자리만 표시 (원문은 my_card에 암호화 저장) */
function maskCardNo(last4: string | null): string {
  return last4 ? `**** **** **** ${last4}` : "****"
}

/** 결제일 — 카드 항목은 my_card.pay_ymd 기준, 체크카드는 즉시결제 */
function payDayLabel(row: MonthDataRow): string {
  if (row.item_type1 === "4") {
    if (row.card_type === "2") return "즉시"
    return row.pay_ymd ? `${row.pay_ymd}일` : "-"
  }
  return row.pay_dd ? `${row.pay_dd}일` : "-"
}

/** 정산기간 — my_card.start_ymd ~ end_ymd */
function settlementLabel(start: string | null, end: string | null): string {
  if (!start || !end) return "-"
  return `${start}일~${end}일`
}

const CATEGORY_COLOR: Record<string, string> = {
  "1": "text-red-600 font-medium",
  "2": "text-purple-600 font-medium",
  "3": "text-amber-600 font-medium",
  "4": "text-blue-600 font-medium",
  "5": "text-emerald-600 font-medium",
}

function getCurrentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}


// Date.setMonth() 는 말일에 롤오버가 생긴다(7/30 → setMonth(1) → 3/2). 연·월 숫자로 계산한다.
function buildMonthOptions(): string[] {
  const options: string[] = []
  const now = new Date()
  let y = now.getFullYear()
  let m = now.getMonth() + 1
  for (let i = 0; i < 24; i++) {
    options.push(`${y}-${String(m).padStart(2, "0")}`)
    m--
    if (m === 0) { m = 12; y-- }
  }
  return options
}

function buildCopyMonthOptions(yearMonth: string): string[] {
  const [y, m] = yearMonth.split("-").map(Number)
  const result: string[] = []
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue
    const d = new Date(y, m - 1 + i, 1)
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }
  return result
}

function fmtYM(yyyymm: string): string {
  const [y, m] = yyyymm.split("-")
  return `${y}년 ${Number(m)}월`
}

function diffLabel(cur: number, prev: number): { text: string; cls: string } {
  const diff = cur - prev
  if (diff === 0 || prev === 0) return { text: "±0", cls: "text-gray-500" }
  const sign = diff > 0 ? "↑" : "↓"
  const cls = diff > 0 ? "text-red-500" : "text-blue-500"
  return { text: `${sign}${fmt(Math.abs(diff))}`, cls }
}

// ─────────────────────────────────────────────
// 툴팁
// ─────────────────────────────────────────────
type TooltipProps = { row: MonthDataRow }

function Tooltip({ row }: TooltipProps) {
  const lines: string[] = []
  if (row.cost_type) lines.push(`결제수단: ${payMethodLabel(row)}`)
  if (row.pay_dd) lines.push(`결제일: ${row.pay_dd}일`)
  if (row.amt) lines.push(`기본금액: ${fmt(row.amt)}`)
  if (row.memo) lines.push(`메모: ${row.memo}`)
  if (lines.length === 0) return null
  return (
    <div className="absolute z-50 left-0 top-full mt-1 bg-gray-800 text-white text-xs rounded p-2 whitespace-nowrap shadow-lg">
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  )
}

// ─────────────────────────────────────────────
// 행 컴포넌트
// ─────────────────────────────────────────────
type RowProps = {
  row: MonthDataRow
  yearMonth: string
  hidePayMethod?: boolean
  onSaved: () => void
  onDelete: (id: number) => void
}

function amountToInput(n: number): string {
  return n ? fmt(n) : ""
}

function CostRow({ row, yearMonth, hidePayMethod, onSaved, onDelete }: RowProps) {
  const [editing, setEditing] = useState(false)
  const [focusTarget, setFocusTarget] = useState<"amount" | "memo">("amount")
  const [saving, setSaving] = useState(false)
  const [val, setVal] = useState(amountToInput(row.amount))
  const [memo, setMemo] = useState(row.memo ?? "")
  const [hover, setHover] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)
  const memoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setVal(amountToInput(row.amount))
    setMemo(row.memo ?? "")
  }, [row.amount, row.memo])

  useEffect(() => {
    if (!editing) return
    if (focusTarget === "memo") memoRef.current?.focus()
    else { amountRef.current?.focus(); amountRef.current?.select() }
  }, [editing, focusTarget])

  // 클릭한 셀에 포커스를 두고 행 전체를 편집 모드로 전환
  function startEdit(target: "amount" | "memo" = "amount") {
    if (editing) return
    setFocusTarget(target)
    setEditing(true)
  }

  // 자동 저장 없음 — [적용] 버튼 또는 Enter로만 확정
  async function save() {
    setSaving(true)
    await upsertCostInfo(yearMonth, row.id, Number(val.replace(/,/g, "")) || 0, memo || null)
    setSaving(false)
    setEditing(false)
    onSaved()
  }

  function cancel() {
    setVal(amountToInput(row.amount))
    setMemo(row.memo ?? "")
    setEditing(false)
  }

  function onEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") save()
    if (e.key === "Escape") cancel()
  }

  return (
    <tr
      className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${editing ? "bg-blue-50" : ""}`}
      onClick={() => startEdit("amount")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <td className="py-1.5 px-2 relative">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-700 text-sm">{row.item_nm}</span>
          {row.item_type2 && <span className="text-xs text-gray-400 bg-gray-100 px-1 rounded">{row.item_type2}</span>}
        </div>
        {hover && <Tooltip row={row} />}
      </td>
      <td className="py-1.5 px-2 text-xs text-gray-500 text-center">
        {payDayLabel(row)}
      </td>
      {!hidePayMethod && (
        <td className="py-1.5 px-2 text-center overflow-hidden">
          {row.cost_type === "2" ? (
            // 연결된 카드가 있으면 카드명으로 (항목 관리 팝업과 같은 기준)
            <span
              className="inline-block max-w-full truncate align-middle px-1.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-600 rounded"
              title={payMethodLabel(row)}
            >{payMethodLabel(row)}</span>
          ) : row.cost_type === "1" ? (
            <span className="inline-block px-1.5 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-600 rounded">현금</span>
          ) : (
            <span className="text-xs text-gray-400">-</span>
          )}
        </td>
      )}
      <td
        className="py-1.5 px-2 text-right"
        onClick={e => { e.stopPropagation(); startEdit("amount") }}
      >
        {editing ? (
          <input
            ref={amountRef}
            type="text"
            inputMode="numeric"
            placeholder="0"
            className="w-24 text-right text-gray-900 bg-white border border-blue-400 rounded px-1 py-0.5 text-sm placeholder:text-gray-400 focus:outline-none"
            value={val}
            onChange={e => {
              const raw = e.target.value.replace(/[^0-9]/g, "")
              setVal(raw ? Number(raw).toLocaleString("ko-KR") : "")
            }}
            onKeyDown={onEditKeyDown}
          />
        ) : (
          <span className="inline-block text-sm font-medium text-gray-800 px-1 py-0.5 rounded hover:bg-blue-50 hover:ring-1 hover:ring-blue-300">
            {row.amount === 0 ? <span className="text-gray-400">-</span> : fmt(row.amount)}
          </span>
        )}
      </td>
      {row.item_type1 === "4" && (
        <>
          <td className="py-1.5 px-2 text-xs text-center">
            {(() => { const d = diffLabel(row.amount, row.prev_amount); return <span className={d.cls}>{d.text}</span> })()}
          </td>
          <td className="py-1.5 px-2 text-xs text-gray-500 text-center">
            {settlementLabel(row.start_ymd, row.end_ymd)}
          </td>
        </>
      )}
      <td
        className="py-1.5 px-2 text-xs text-gray-500 overflow-hidden truncate"
        onClick={e => { e.stopPropagation(); startEdit("memo") }}
      >
        {editing ? (
          <input
            ref={memoRef}
            placeholder="메모"
            className="w-full text-gray-900 bg-white border border-blue-400 rounded px-1 py-0.5 text-xs placeholder:text-gray-400 focus:outline-none"
            value={memo}
            onChange={e => setMemo(e.target.value)}
            onKeyDown={onEditKeyDown}
          />
        ) : (
          <span className="inline-block px-1 py-0.5 rounded hover:bg-blue-50 hover:ring-1 hover:ring-blue-300">
            {row.memo || <span className="text-gray-300">-</span>}
          </span>
        )}
      </td>
      <td className="py-1.5 px-2 text-right" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1.5">
          {editing && (
            <>
              <button
                disabled={saving}
                className="text-xs px-1.5 py-0.5 text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                onClick={save}
              >{saving ? "저장중" : "적용"}</button>
              <button
                className="text-xs text-gray-400 hover:text-gray-600"
                onClick={cancel}
                title="취소 (Esc)"
              >취소</button>
            </>
          )}
          <button
            className="text-xs text-gray-400 hover:text-red-500"
            onClick={() => { if (confirm(`"${row.item_nm}" 항목의 ${fmtYM(yearMonth)} 데이터를 삭제하시겠습니까?`)) onDelete(row.id) }}
          >✕</button>
        </div>
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────
// 카테고리 옵션 (항목 관리 모달용)
// ─────────────────────────────────────────────
const CATEGORY_MANAGE_OPTIONS = [
  { label: "고정지출",      value: "1" },
  { label: "고정이체",      value: "2" },
  { label: "생활비/공과금", value: "3" },
  { label: "카드결재",      value: "4" },
  { label: "수입",          value: "5" },
]

const BUILDING_OPTIONS = ["푸르지오", "효성쉐르빌", "신곡동빌라"]

// ─────────────────────────────────────────────
// 항목 추가 모달
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// 항목 관리 모달
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// 항목 수정 모달
// ─────────────────────────────────────────────
type EditItemModalProps = {
  item: CostItem
  onClose: () => void
  onUpdated: () => void
}

function EditItemModal({ item, onClose, onUpdated }: EditItemModalProps) {
  const [category, setCategory] = useState(item.item_type1)
  const [building, setBuilding] = useState(item.item_type2 ?? "")
  const [name, setName] = useState(item.item_nm)
  const [payMethod, setPayMethod] = useState(toPayMethodValue(item.cost_type, item.card_id))
  const [payDay, setPayDay] = useState(item.pay_dd != null ? String(item.pay_dd) : "")
  const [amt, setAmt] = useState(Math.round(item.amt).toLocaleString("ko-KR"))
  const [memo, setMemo] = useState(item.memo ?? "")
  const [cardId, setCardId] = useState(item.card_id != null ? String(item.card_id) : "")
  const [cards, setCards] = useState<CardMaster[]>([])
  const [saving, setSaving] = useState(false)

  // 결제수단 드롭다운과 연결 카드 select 양쪽에서 쓴다
  useEffect(() => { getCards().then(setCards) }, [])

  // 신용카드 카테고리로 바꾸면 결제수단에서 카드 목록이 사라지므로 선택값을 되돌린다
  useEffect(() => {
    if (category === "4" && payMethod.startsWith("card:")) setPayMethod("card")
  }, [category, payMethod])

  async function save(e: React.SyntheticEvent) {
    e.preventDefault()
    setSaving(true)
    const pm = fromPayMethodValue(payMethod)
    await updateCostItemFields(item.id, {
      item_type1: category,
      item_type2: category === "3" ? (building || null) : null,
      item_nm: name,
      cost_type: pm.cost_type,
      pay_dd: payDay ? Number(payDay) : null,
      amt: Number(amt.replace(/,/g, "")) || 0,
      memo: memo || null,
      // 신용카드 항목은 별도 "연결 카드" 필드, 그 외는 결제수단에서 고른 카드
      card_id: category === "4" ? (cardId ? Number(cardId) : null) : pm.card_id,
    })
    setSaving(false)
    onUpdated()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-base font-bold text-gray-800">항목 수정</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <form onSubmit={save}>
          <div className="px-6 py-5 space-y-4">

            {/* 카테고리 + 건물명 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">카테고리</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  value={category} onChange={e => setCategory(e.target.value)}
                >
                  {CATEGORY_MANAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {category === "3" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">건물명</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                    value={building} onChange={e => setBuilding(e.target.value)}
                  >
                    <option value="">-</option>
                    {BUILDING_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* 항목명 */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">항목명 <span className="text-red-400">*</span></label>
              <input
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                value={name} onChange={e => setName(e.target.value)}
              />
            </div>

            {/* 연결 카드 (신용카드 카테고리만) */}
            {category === "4" && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">연결 카드</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  value={cardId} onChange={e => setCardId(e.target.value)}
                >
                  <option value="">연결 없음</option>
                  {cards.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.card_nm} ({getCardTypeLabel(c.card_type)})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  카드명·결제일·정산기간은 연결된 카드 정보를 사용합니다.
                </p>
              </div>
            )}

            {/* 결제수단 · 결제일 · 기본금액 */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">결제수단</label>
                <PayMethodSelect
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  value={payMethod}
                  cards={category === "4" ? [] : cards}
                  onChange={setPayMethod}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">결제일</label>
                <input
                  type="number" min={1} max={31} placeholder="-"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  value={payDay} onChange={e => setPayDay(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">기본금액</label>
                <input
                  type="text" inputMode="numeric" placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  value={amt}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9]/g, "")
                    setAmt(raw ? Number(raw).toLocaleString("ko-KR") : "")
                  }}
                />
              </div>
            </div>

            {/* 비고 */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">비고</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                value={memo} onChange={e => setMemo(e.target.value)} placeholder="선택사항"
              />
            </div>

          </div>

          {/* 푸터 */}
          <div className="flex justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              취소
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 카드 상세 모달 (my_card)
// ─────────────────────────────────────────────
/** 민감 컬럼 1개 — 마스킹 표시 + [보기] 클릭 시 서버에서 복호화 */
function SecretField({ label, cardId, field, exists, mask }: {
  label: string
  cardId: number
  field: CardSecretField
  exists: boolean
  mask: string
}) {
  const [revealed, setRevealed] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reveal() {
    setLoading(true)
    setError(null)
    const res = await revealCardSecret(cardId, field)
    if (res.ok) setRevealed(res.value)
    else setError(res.error)
    setLoading(false)
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-900 font-mono">
          {!exists ? <span className="text-gray-400">미등록</span> : revealed ?? mask}
        </span>
        {exists && (
          revealed === null ? (
            <button
              type="button" onClick={reveal} disabled={loading}
              className="text-xs px-1.5 py-0.5 text-blue-600 border border-blue-300 rounded hover:bg-blue-50 disabled:opacity-50"
            >{loading ? "..." : "보기"}</button>
          ) : (
            <button
              type="button" onClick={() => setRevealed(null)}
              className="text-xs px-1.5 py-0.5 text-gray-500 border border-gray-300 rounded hover:bg-gray-50"
            >가리기</button>
          )
        )}
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

function CardDetailModal({ cardId, onClose, onUpdated }: {
  cardId: number
  onClose: () => void
  onUpdated: () => void
}) {
  const [card, setCard] = useState<CardMaster | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    card_nm: "", card_type: "", pay_ymd: "", start_ymd: "", end_ymd: "", memo: "",
  })
  // 민감 항목은 새로 입력했을 때만 저장한다 (빈 값이면 기존 암호문 유지)
  const [newCardNo, setNewCardNo] = useState("")
  const [newLimitYm, setNewLimitYm] = useState("")
  const [newCvc, setNewCvc] = useState("")

  const reload = useCallback(async () => {
    const data = await getCardMaster(cardId)
    setCard(data)
    if (data) {
      setForm({
        card_nm:   data.card_nm ?? "",
        card_type: data.card_type ?? "",
        pay_ymd:   data.pay_ymd ?? "",
        start_ymd: data.start_ymd ?? "",
        end_ymd:   data.end_ymd ?? "",
        memo:      data.memo ?? "",
      })
    }
    setLoading(false)
  }, [cardId])

  useEffect(() => { reload() }, [reload])

  const isCheckCard = form.card_type === "2"

  async function save(e: React.SyntheticEvent) {
    e.preventDefault()
    setSaving(true)
    await updateCardMaster(cardId, {
      card_nm:   form.card_nm,
      card_type: form.card_type || null,
      // 체크카드는 즉시결제 → 결제일·정산기간을 비운다
      pay_ymd:   isCheckCard ? null : (form.pay_ymd || null),
      start_ymd: isCheckCard ? null : (form.start_ymd || null),
      end_ymd:   isCheckCard ? null : (form.end_ymd || null),
      memo:      form.memo || null,
      ...(newCardNo ? { card_no: newCardNo } : {}),
      ...(newLimitYm ? { limit_ym: newLimitYm } : {}),
      ...(newCvc ? { cvc: newCvc } : {}),
    })
    setSaving(false)
    onUpdated()
    onClose()
  }

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))
  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-base font-bold text-gray-800">카드 정보</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
        ) : !card ? (
          <div className="text-center py-10 text-gray-400 text-sm">카드 정보를 찾을 수 없습니다</div>
        ) : (
          <form onSubmit={save}>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">카드명 <span className="text-red-400">*</span></label>
                  <input required className={inputCls} value={form.card_nm} onChange={e => set("card_nm", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">구분</label>
                  <select className={inputCls} value={form.card_type} onChange={e => set("card_type", e.target.value)}>
                    <option value="">-</option>
                    {CARD_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {isCheckCard ? (
                <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  체크카드는 즉시결제라 결제일·정산기간을 사용하지 않습니다.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">결제일</label>
                    <input type="number" min={1} max={31} placeholder="-" className={`${inputCls} text-right`}
                      value={form.pay_ymd} onChange={e => set("pay_ymd", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">정산 시작일</label>
                    <input type="number" min={1} max={31} placeholder="-" className={`${inputCls} text-right`}
                      value={form.start_ymd} onChange={e => set("start_ymd", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">정산 종료일</label>
                    <input type="number" min={1} max={31} placeholder="-" className={`${inputCls} text-right`}
                      value={form.end_ymd} onChange={e => set("end_ymd", e.target.value)} />
                  </div>
                </div>
              )}

              {/* 민감정보 — 암호화 저장, 조회는 [보기] 클릭 시 서버에서 복호화 */}
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <SecretField
                  label="카드번호" cardId={cardId} field="card_no"
                  exists={card.has_card_no} mask={maskCardNo(card.card_no_last4)}
                />
                <div className="grid grid-cols-2 gap-4">
                  <SecretField label="유효기간" cardId={cardId} field="limit_ym" exists={card.has_limit_ym} mask="****" />
                  <SecretField label="CVC" cardId={cardId} field="cvc" exists={card.has_cvc} mask="***" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">카드번호 변경</label>
                    <input className={inputCls} placeholder="비우면 유지"
                      value={newCardNo} onChange={e => setNewCardNo(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">유효기간 변경</label>
                    <input className={inputCls} placeholder="비우면 유지" inputMode="numeric"
                      value={newLimitYm} onChange={e => setNewLimitYm(e.target.value.replace(/\D/g, ""))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">CVC 변경</label>
                    <input className={inputCls} placeholder="비우면 유지" inputMode="numeric"
                      value={newCvc} onChange={e => setNewCvc(e.target.value.replace(/\D/g, ""))} />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">비고</label>
                <input className={inputCls} placeholder="선택사항" value={form.memo} onChange={e => set("memo", e.target.value)} />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-200">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">취소</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 카드 추가 모달
// ─────────────────────────────────────────────
function AddCardModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    card_nm: "", card_no: "", card_type: "1",
    pay_ymd: "", start_ymd: "", end_ymd: "", limit_ym: "", cvc: "", memo: "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))
  const isCheckCard = form.card_type === "2"
  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addCard({
        card_nm: form.card_nm,
        card_no: form.card_no,
        card_type: form.card_type || null,
        pay_ymd: isCheckCard ? null : (form.pay_ymd || null),
        start_ymd: isCheckCard ? null : (form.start_ymd || null),
        end_ymd: isCheckCard ? null : (form.end_ymd || null),
        limit_ym: form.limit_ym || null,
        cvc: form.cvc || null,
        memo: form.memo || null,
      })
      onAdded()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "카드를 추가하지 못했습니다.")
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-base font-bold text-gray-800">카드 추가</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <form onSubmit={submit}>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">카드명 <span className="text-red-400">*</span></label>
                <input required className={inputCls} value={form.card_nm} onChange={e => set("card_nm", e.target.value)} placeholder="예: 현대카드(네이버)" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">구분</label>
                <select className={inputCls} value={form.card_type} onChange={e => set("card_type", e.target.value)}>
                  {CARD_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">카드번호 <span className="text-red-400">*</span></label>
              <input required className={inputCls} value={form.card_no} onChange={e => set("card_no", e.target.value)} placeholder="0000-0000-0000-0000" />
              <p className="text-xs text-gray-400 mt-1">암호화해 저장되며 목록에는 뒤 4자리만 표시됩니다.</p>
            </div>

            {isCheckCard ? (
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                체크카드는 즉시결제라 결제일·정산기간을 사용하지 않습니다.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">결제일</label>
                  <input type="number" min={1} max={31} placeholder="-" className={`${inputCls} text-right`} value={form.pay_ymd} onChange={e => set("pay_ymd", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">정산 시작일</label>
                  <input type="number" min={1} max={31} placeholder="-" className={`${inputCls} text-right`} value={form.start_ymd} onChange={e => set("start_ymd", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">정산 종료일</label>
                  <input type="number" min={1} max={31} placeholder="-" className={`${inputCls} text-right`} value={form.end_ymd} onChange={e => set("end_ymd", e.target.value)} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">유효기간</label>
                <input className={inputCls} inputMode="numeric" placeholder="MMYY" value={form.limit_ym} onChange={e => set("limit_ym", e.target.value.replace(/\D/g, ""))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">CVC</label>
                <input className={inputCls} inputMode="numeric" placeholder="000" value={form.cvc} onChange={e => set("cvc", e.target.value.replace(/\D/g, ""))} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">비고</label>
              <input className={inputCls} placeholder="선택사항" value={form.memo} onChange={e => set("memo", e.target.value)} />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">취소</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "저장 중..." : "추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 카드 목록 모달 (my_card 전체)
// ─────────────────────────────────────────────
function CardListModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [cards, setCards] = useState<CardMaster[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCardId, setEditingCardId] = useState<number | null>(null)
  const [showAddCard, setShowAddCard] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setCards(await getCards())
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[55]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-700">카드 정보</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <div className="px-4 py-2 border-b border-gray-100 flex items-center">
          <button
            onClick={() => setShowAddCard(true)}
            className="ml-auto text-sm text-blue-600 border border-blue-300 rounded px-3 py-1 hover:bg-blue-50"
          >
            카드 추가
          </button>
        </div>

        <div className="overflow-auto flex-1 px-1">
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
          ) : cards.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">등록된 카드가 없습니다</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="text-xs text-gray-500 border-b border-gray-200">
                  <th className="px-3 py-2 text-left font-medium">카드명</th>
                  <th className="px-3 py-2 text-center font-medium">구분</th>
                  <th className="px-3 py-2 text-center font-medium">결제일</th>
                  <th className="px-3 py-2 text-center font-medium">정산기간</th>
                  <th className="px-3 py-2 text-left font-medium">카드번호</th>
                  <th className="px-3 py-2 text-center font-medium">유효기간·CVC</th>
                  <th className="px-3 py-2 text-center font-medium">수정</th>
                </tr>
              </thead>
              <tbody>
                {cards.map(c => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-800">{c.card_nm}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={c.card_type === "2" ? "text-emerald-600 text-xs font-medium" : "text-blue-600 text-xs font-medium"}>
                        {getCardTypeLabel(c.card_type)}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-center text-gray-600 text-xs">
                      {c.card_type === "2" ? "즉시" : c.pay_ymd ? `${c.pay_ymd}일` : "-"}
                    </td>
                    <td className="px-3 py-1.5 text-center text-gray-600 text-xs">
                      {settlementLabel(c.start_ymd, c.end_ymd)}
                    </td>
                    <td className="px-3 py-1.5 text-gray-600 text-xs font-mono">
                      {c.has_card_no ? maskCardNo(c.card_no_last4) : <span className="text-gray-300">미등록</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center text-xs">
                      <span className={c.has_limit_ym ? "text-gray-500" : "text-gray-300"}>{c.has_limit_ym ? "****" : "미등록"}</span>
                      <span className="text-gray-300 mx-1">/</span>
                      <span className={c.has_cvc ? "text-gray-500" : "text-gray-300"}>{c.has_cvc ? "***" : "미등록"}</span>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <button
                        onClick={() => setEditingCardId(c.id)}
                        className="text-xs px-2 py-0.5 border text-gray-600 rounded hover:bg-gray-50"
                      >수정</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400">유효기간·CVC는 암호화 저장되며 [수정]에서 [보기]로만 확인할 수 있습니다.</span>
          <button onClick={onClose} className="text-sm px-4 py-1.5 border rounded text-gray-600 hover:bg-gray-50">닫기</button>
        </div>
      </div>

      {showAddCard && (
        <AddCardModal
          onClose={() => setShowAddCard(false)}
          onAdded={async () => { await reload(); onChanged() }}
        />
      )}
      {editingCardId != null && (
        <CardDetailModal
          cardId={editingCardId}
          onClose={() => setEditingCardId(null)}
          onUpdated={async () => { await reload(); onChanged() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 항목 관리 모달 행
// ─────────────────────────────────────────────
type ManageRowProps = {
  item: ManagedCostItem
  onEdit: (item: CostItem) => void
  onUpdated: () => void
}

function ManageRow({ item, onEdit, onUpdated }: ManageRowProps) {
  async function toggleActive() {
    if (item.use_yn === 'Y') await deactivateCostItem(item.id)
    else await activateCostItem(item.id)
    onUpdated()
  }

  // 되돌릴 수 없으므로 월별 실적이 함께 지워지는 것을 확인창에 명시한다
  async function handleDelete() {
    const detail = item.info_cnt > 0
      ? `\n\n⚠ 월별 실적 ${item.info_cnt}건(${item.first_ym} ~ ${item.last_ym})도 함께 삭제되며 되돌릴 수 없습니다.\n일시적으로 쓰지 않는 항목이라면 [비활성]을 이용하세요.`
      : "\n\n연결된 월별 실적이 없습니다."
    if (!confirm(`"${item.item_nm}" 항목을 삭제합니다.${detail}`)) return
    try {
      await deleteCostItem(item.id)
      onUpdated()
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제하지 못했습니다.")
    }
  }

  const rowCls = `border-b border-gray-100 text-sm ${item.use_yn !== 'Y' ? "opacity-40" : "hover:bg-gray-50"}`
  const categoryLabel = CATEGORY_MANAGE_OPTIONS.find(o => o.value === item.item_type1)?.label ?? item.item_type1

  return (
    <tr className={rowCls}>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <span className={`text-xs ${CATEGORY_COLOR[item.item_type1] ?? "text-gray-500"}`}>{categoryLabel}</span>
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <span className="text-xs text-gray-600">{item.item_type2 ?? "-"}</span>
      </td>
      <td className="px-2 py-1.5">
        <span className="text-gray-800">{item.item_nm}</span>
      </td>
      <td className="px-2 py-1.5">
        <span className={`text-sm ${PAY_METHOD_COLOR[item.cost_type ?? ""] ?? "text-gray-400"}`}>
          {payMethodLabel(item)}
        </span>
        {item.cost_type === "2" && item.item_type1 !== "4" && !item.card_nm && (
          <span className="ml-1 text-xs text-gray-400">미지정</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-center">
        <span className="text-gray-600">{item.pay_dd ?? "-"}</span>
      </td>
      <td className="px-2 py-1.5 text-right">
        <span className="text-gray-700 font-medium">{item.amt ? fmt(item.amt) : "-"}</span>
      </td>
      <td className="px-2 py-1.5 text-center whitespace-nowrap">
        <button onClick={() => onEdit(item)} className="text-xs px-2 py-0.5 border text-gray-600 rounded hover:bg-gray-50">수정</button>
      </td>
      <td className="px-2 py-1.5 text-center">
        <button
          onClick={toggleActive}
          className={`text-xs px-2 py-0.5 rounded border ${item.use_yn === 'Y' ? "text-red-500 border-red-200 hover:bg-red-50" : "text-green-600 border-green-200 hover:bg-green-50"}`}
        >
          {item.use_yn === 'Y' ? "비활성" : "활성화"}
        </button>
      </td>
      <td className="px-2 py-1.5 text-center">
        <button
          onClick={handleDelete}
          disabled={item.shopping_cnt > 0}
          title={item.shopping_cnt > 0
            ? `쇼핑 구매 내역 ${item.shopping_cnt}건이 참조 중이라 삭제할 수 없습니다`
            : item.info_cnt > 0
              ? `월별 실적 ${item.info_cnt}건도 함께 삭제됩니다`
              : "삭제"}
          className="text-xs px-2 py-0.5 rounded border text-gray-500 border-gray-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500 disabled:hover:border-gray-300"
        >삭제</button>
      </td>
    </tr>
  )
}

function ItemManageModal({ onClose, onChanged, defaultCategory = "" }: { onClose: () => void; onChanged: () => void; defaultCategory?: string }) {
  const [items, setItems] = useState<ManagedCostItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingItem, setEditingItem] = useState<CostItem | null>(null)
  const [showCardList, setShowCardList] = useState(false)
  const [filterCategory, setFilterCategory] = useState(defaultCategory)

  const reload = useCallback(async () => {
    setLoading(true)
    setItems(await getAllCostItems())
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  async function handleUpdated() {
    await reload()
    onChanged()
  }

  const filteredItems = filterCategory
    ? items.filter(i => i.item_type1 === filterCategory)
    : items

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-700">입출금 항목 관리</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
          <span className="text-xs text-gray-500">카테고리</span>
          <select
            className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white focus:outline-none focus:border-blue-400"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
          >
            <option value="">전체</option>
            {CATEGORY_MANAGE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => setShowAdd(true)}
            className="ml-auto text-sm text-blue-600 border border-blue-300 rounded px-3 py-1 hover:bg-blue-50"
          >
            입출금 항목 추가
          </button>
          <button
            onClick={() => setShowCardList(true)}
            className="text-sm text-gray-600 border border-gray-300 rounded px-3 py-1 hover:bg-gray-50"
          >
            카드 정보
          </button>
        </div>
        <div className="overflow-auto flex-1 px-1">
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="text-xs text-gray-500 border-b border-gray-200">
                  <th className="px-2 py-2 text-left font-medium">카테고리</th>
                  <th className="px-2 py-2 text-left font-medium">건물명</th>
                  <th className="px-2 py-2 text-left font-medium">항목명</th>
                  <th className="px-2 py-2 text-left font-medium">결제수단</th>
                  <th className="px-2 py-2 text-center font-medium">결제일</th>
                  <th className="px-2 py-2 text-right font-medium">기본금액</th>
                  <th className="px-2 py-2 text-center font-medium">수정</th>
                  <th className="px-2 py-2 text-center font-medium">상태</th>
                  <th className="px-2 py-2 text-center font-medium">삭제</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => (
                  <ManageRow key={item.id} item={item} onEdit={setEditingItem} onUpdated={handleUpdated} />
                ))}
                {filteredItems.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-8 text-gray-400 text-sm">항목 없음</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="text-sm px-4 py-1.5 border rounded text-gray-600 hover:bg-gray-50">닫기</button>
        </div>
      </div>
      {showAdd && (
        <AddItemModal
          defaultCategory={filterCategory || "1"}
          onClose={() => setShowAdd(false)}
          onAdded={handleUpdated}
        />
      )}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onUpdated={async () => { setEditingItem(null); await handleUpdated() }}
        />
      )}
      {showCardList && (
        <CardListModal
          onClose={() => setShowCardList(false)}
          onChanged={handleUpdated}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
type AddModalProps = {
  defaultCategory: string
  onClose: () => void
  onAdded: () => void
}

function AddItemModal({ defaultCategory, onClose, onAdded }: AddModalProps) {
  const [form, setForm] = useState<Partial<CostItem>>({ item_type1: defaultCategory })
  const [payMethod, setPayMethod] = useState("")
  const [cards, setCards] = useState<CardMaster[]>([])
  const [saving, setSaving] = useState(false)

  function set(k: string, v: string | number | null) {
    setForm(f => ({ ...f, [k]: v }))
  }

  // 결제수단 드롭다운과 연결 카드 select 양쪽에서 쓴다
  useEffect(() => { getCards().then(setCards) }, [])

  // 신용카드 카테고리로 바꾸면 결제수단에서 카드 목록이 사라지므로 선택값을 되돌린다
  useEffect(() => {
    if (form.item_type1 === "4" && payMethod.startsWith("card:")) setPayMethod("card")
  }, [form.item_type1, payMethod])

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!form.item_nm || !form.item_type1) return
    setSaving(true)
    const pm = fromPayMethodValue(payMethod)
    await addCostItem({
      item_type1: form.item_type1!,
      item_type2: form.item_type2 ?? null,
      item_nm: form.item_nm!,
      cost_type: pm.cost_type,
      pay_dd: form.pay_dd ? Number(form.pay_dd) : null,
      amt: Number(form.amt) || 0,
      memo: form.memo ?? null,
      // 신용카드 항목은 별도 "연결 카드" 필드, 그 외는 결제수단에서 고른 카드
      card_id: form.item_type1 === "4" ? (form.card_id ?? null) : pm.card_id,
    })
    setSaving(false)
    onAdded()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-base font-bold text-gray-800">입출금 항목 추가</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <form onSubmit={submit}>
          <div className="px-6 py-5 space-y-4">

            {/* 카테고리 + 건물명 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">카테고리 <span className="text-red-400">*</span></label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent" value={form.item_type1 ?? ""} onChange={e => set("item_type1", e.target.value)}>
                  {CATEGORY_MANAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {form.item_type1 === "3" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">건물명</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent" value={form.item_type2 ?? ""} onChange={e => set("item_type2", e.target.value)}>
                    <option value="">-</option>
                    {BUILDING_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* 항목명 */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">항목명 <span className="text-red-400">*</span></label>
              <input
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                value={form.item_nm ?? ""}
                onChange={e => set("item_nm", e.target.value)}
                placeholder="항목명 입력"
              />
            </div>

            {/* 연결 카드 (신용카드 카테고리만) */}
            {form.item_type1 === "4" && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">연결 카드</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  value={form.card_id != null ? String(form.card_id) : ""}
                  onChange={e => set("card_id", e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">연결 없음</option>
                  {cards.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.card_nm} ({getCardTypeLabel(c.card_type)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 결제수단 · 결제일 · 기본금액 */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">결제수단</label>
                <PayMethodSelect
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  value={payMethod}
                  cards={form.item_type1 === "4" ? [] : cards}
                  onChange={setPayMethod}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">결제일</label>
                <input
                  type="number" min={1} max={31}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  value={form.pay_dd ?? ""}
                  onChange={e => set("pay_dd", e.target.value)}
                  placeholder="-"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">기본금액</label>
                <input
                  type="text" inputMode="numeric"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  value={form.amt ? Number(form.amt).toLocaleString("ko-KR") : ""}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9]/g, "")
                    set("amt", raw ? Number(raw) : null)
                  }}
                  placeholder="0"
                />
              </div>
            </div>

            {/* 비고 */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">비고</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                value={(form.memo as string) ?? ""}
                onChange={e => set("memo", e.target.value || null)}
                placeholder="선택사항"
              />
            </div>

          </div>

          {/* 푸터 */}
          <div className="flex justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              취소
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "저장 중..." : "추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 섹션 헤더
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// 생활비 복사 모달
// ─────────────────────────────────────────────
function CopyMonthModal({ yearMonth, onClose, onCopied }: {
  yearMonth: string
  onClose: () => void
  onCopied: () => void
}) {
  const months = buildCopyMonthOptions(yearMonth)
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function apply() {
    if (!selected) return
    const msg = `${fmtYM(yearMonth)} 데이터가 삭제되고 ${fmtYM(selected)} 데이터로 변경됩니다.\n계속하시겠습니까?`
    if (!confirm(msg)) return
    setSaving(true)
    await copyFromMonth(yearMonth, selected)
    setSaving(false)
    onCopied()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-64 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-bold text-gray-700">생활비 복사</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-gray-500 mb-3">복사할 원본 년월을 선택하세요.</p>
          <div className="space-y-1">
            {months.map(m => (
              <button
                key={m}
                onClick={() => setSelected(m)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  selected === m
                    ? "bg-blue-50 text-blue-700 font-medium border border-blue-200"
                    : "hover:bg-gray-50 text-gray-700 border border-transparent"
                }`}
              >
                {fmtYM(m)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 bg-gray-50 border-t border-gray-200">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50">취소</button>
          <button
            onClick={apply}
            disabled={!selected || saving}
            className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? "복사 중..." : "적용"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 월 항목 추가 모달 (my_cost_info 생성)
// ─────────────────────────────────────────────
function AddToMonthModal({ yyyymm, category, onClose, onAdded }: {
  yyyymm: string
  category: string
  onClose: () => void
  onAdded: () => void
}) {
  const [items, setItems] = useState<CostItem[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getAvailableCostItems(yyyymm, category).then(data => {
      setItems(data)
      setLoading(false)
    })
  }, [yyyymm, category])

  function toggleItem(id: number) {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(items.map(i => i.id)) : new Set())
  }

  async function submit() {
    if (selected.size === 0) return
    setSaving(true)
    await addCostInfoItems(yyyymm, [...selected])
    setSaving(false)
    onAdded()
    onClose()
  }

  const categoryLabel = CATEGORY_MANAGE_OPTIONS.find(o => o.value === category)?.label ?? category
  const allSelected = items.length > 0 && selected.size === items.length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-base font-bold text-gray-800">{categoryLabel} — 항목 추가</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="overflow-auto max-h-[50vh]">
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">추가 가능한 항목이 없습니다</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b border-gray-200">
                <tr className="text-xs text-gray-500">
                  <th className="px-4 py-2 text-center">
                    <input type="checkbox" checked={allSelected} onChange={e => toggleAll(e.target.checked)} />
                  </th>
                  <th className="px-4 py-2 text-left font-medium">항목명</th>
                  <th className="px-4 py-2 text-center font-medium">결제수단</th>
                  <th className="px-4 py-2 text-center font-medium">결제일</th>
                  <th className="px-4 py-2 text-right font-medium">기본금액</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr
                    key={item.id}
                    className={`border-b border-gray-100 cursor-pointer transition-colors ${selected.has(item.id) ? "bg-blue-50" : "hover:bg-gray-50"}`}
                    onClick={() => toggleItem(item.id)}
                  >
                    <td className="px-4 py-2 text-center" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleItem(item.id)} />
                    </td>
                    <td className="px-4 py-2 text-gray-800">{item.item_nm}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={PAY_METHOD_COLOR[item.cost_type ?? ""] ?? "text-gray-400"}>{getPayMethodLabel(item.cost_type)}</span>
                    </td>
                    <td className="px-4 py-2 text-center text-gray-600">{item.pay_dd ?? "-"}</td>
                    <td className="px-4 py-2 text-right text-gray-700 font-medium">{item.amt ? fmt(item.amt) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-200">
          <span className="text-sm text-gray-500">{selected.size > 0 ? `${selected.size}개 선택` : "항목을 선택하세요"}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">취소</button>
            <button onClick={submit} disabled={saving || selected.size === 0} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "추가 중..." : "추가"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
function SectionHeader({ title, onAdd, cardTotal, cashTotal }: {
  title: string
  onAdd: () => void
  cardTotal?: number
  cashTotal?: number
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        {(cardTotal !== undefined || cashTotal !== undefined) && (
          <div className="flex items-center gap-3 text-xs">
            {!!cardTotal && <span className="text-blue-500">카드 <span className="font-semibold text-blue-600">{fmt(cardTotal)}</span></span>}
            {!!cashTotal && <span className="text-emerald-600">현금 <span className="font-semibold text-emerald-600">{fmt(cashTotal)}</span></span>}
          </div>
        )}
      </div>
      <button onClick={onAdd} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ 항목추가</button>
    </div>
  )
}

// ─────────────────────────────────────────────
// 접기/펼치기 섹션 카드
// ─────────────────────────────────────────────
function SectionCard({ title, defaultCollapsed, onAdd, cardTotal, cashTotal, children }: {
  title: string
  defaultCollapsed?: boolean
  onAdd: () => void
  cardTotal?: number
  cashTotal?: number
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false)
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-700">{title}</span>
          {(cardTotal !== undefined || cashTotal !== undefined) && (
            <div className="flex items-center gap-3 text-xs">
              {!!cardTotal && <span className="text-blue-500">카드 <span className="font-semibold text-blue-600">{fmt(cardTotal)}</span></span>}
              {!!cashTotal && <span className="text-emerald-600">현금 <span className="font-semibold text-emerald-600">{fmt(cashTotal)}</span></span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onAdd} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ 항목추가</button>
          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-xs text-gray-400 hover:text-gray-600 w-5 text-center leading-none"
          >
            {collapsed ? "▼" : "▲"}
          </button>
        </div>
      </div>
      {!collapsed && children}
    </div>
  )
}

// ─────────────────────────────────────────────
// 섹션 테이블
// ─────────────────────────────────────────────
type SectionTableProps = {
  rows: MonthDataRow[]
  yearMonth: string
  showSettlement?: boolean
  hidePayMethod?: boolean
  compact?: boolean
  onSaved: () => void
  onDelete: (id: number) => void
}

function SectionTable({ rows, yearMonth, showSettlement, hidePayMethod, compact, onSaved, onDelete }: SectionTableProps) {
  const total = rows.reduce((s, r) => s + r.amount, 0)
  const cardTotal = rows.filter(r => r.cost_type === "2").reduce((s, r) => s + r.amount, 0)
  const cashTotal = rows.filter(r => r.cost_type === "1").reduce((s, r) => s + r.amount, 0)
  const baseCols = hidePayMethod ? 2 : 3
  // 금액 뒤 컬럼 수: (전월대비 + 정산기간) + 메모 + 버튼
  const trailCols = showSettlement ? 4 : 2
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="text-xs text-gray-500 border-b border-gray-200">
          <th className={`py-1 px-2 text-left ${compact ? "" : "w-[200px]"}`}>항목명</th>
          <th className="py-1 px-2 text-center w-[50px]">날짜</th>
          {!hidePayMethod && <th className="py-1 px-2 text-center w-[112px]">결제수단</th>}
          <th className="py-1 px-2 text-right w-[100px]">금액</th>
          {showSettlement && <th className="py-1 px-2 text-center w-[90px]">전월대비</th>}
          {showSettlement && <th className="py-1 px-2 text-center w-[90px]">정산기간</th>}
          <th className={`py-1 px-2 text-left ${compact ? "w-[80px]" : ""}`}>메모</th>
          <th className="py-1 px-2 w-[100px]"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <CostRow key={row.id} row={row} yearMonth={yearMonth} hidePayMethod={hidePayMethod} onSaved={onSaved} onDelete={onDelete} />
        ))}
      </tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-50">
            <td colSpan={baseCols} className="py-1 px-2 text-xs text-gray-500 text-right">합계</td>
            <td className="py-1 px-2 text-right text-sm font-semibold text-gray-700">{fmt(total)}</td>
            <td colSpan={trailCols}></td>
          </tr>
        </tfoot>
      )}
    </table>
  )
}

// ─────────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────────
export default function CostPage() {
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth())
  const [rows, setRows] = useState<MonthDataRow[]>([])
  const [recentMonths, setRecentMonths] = useState<RecentMonthSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showItemManage, setShowItemManage] = useState(false)
  const [showCopyMonth, setShowCopyMonth] = useState(false)
  const [addMonthCategory, setAddMonthCategory] = useState<string | null>(null)
  const monthOptions = buildMonthOptions()

  const load = useCallback(async () => {
    setLoading(true)
    const [data, recent] = await Promise.all([
      getMonthData(yearMonth),
      getRecentMonths(yearMonth, 3),
    ])
    setRows(data)
    setRecentMonths(recent)
    setLoading(false)
  }, [yearMonth])

  useEffect(() => { load() }, [load])

  async function handleDelete(itemId: number) {
    await deleteCostInfo(yearMonth, itemId)
    load()
  }

  async function handleCopyPrev() {
    if (!confirm("이전 달 데이터를 복사하시겠습니까?")) return
    await copyFromPrevMonth(yearMonth)
    load()
  }

  // 집계 (cost_task.md 집계 로직)
  // 카드로 결제한 항목은 다음 달 카드 청구액에 포함되어 신용카드 섹션으로 들어오므로 당월 지출에서 뺀다.
  // 신용카드 항목(4)은 카드 대금이 계좌에서 빠지는 것이라 제외 대상이 아니다.
  const isCardUsage = (r: MonthDataRow) =>
    r.item_type1 !== "4" && r.item_type1 !== "5" && r.cost_type === "2"

  const income = rows.filter(r => r.item_type1 === "5").reduce((s, r) => s + r.amount, 0)
  const cardUsage = rows.filter(isCardUsage).reduce((s, r) => s + r.amount, 0)
  const expense = rows
    .filter(r => r.item_type1 !== "5" && !isCardUsage(r))
    .reduce((s, r) => s + r.amount, 0)
  const balance = income - expense
  const cardBill = rows.filter(r => r.item_type1 === "4").reduce((s, r) => s + r.amount, 0)
  const expenseCash = expense - cardBill

  // 카테고리별 그룹
  const fixedRows = rows.filter(r => r.item_type1 === "1")
  const transferRows = rows.filter(r => r.item_type1 === "2")
  const livingRows = rows.filter(r => r.item_type1 === "3")
  const cardRows = rows.filter(r => r.item_type1 === "4")
  const incomeRows = rows.filter(r => r.item_type1 === "5")

  function sectionTotals(sRows: MonthDataRow[]) {
    return {
      card: sRows.filter(r => r.cost_type === "2").reduce((s, r) => s + r.amount, 0),
      cash: sRows.filter(r => r.cost_type === "1").reduce((s, r) => s + r.amount, 0),
    }
  }
  const fixedTotals = sectionTotals(fixedRows)
  const transferTotals = sectionTotals(transferRows)
  const livingTotals = sectionTotals(livingRows)
  const cardSectionTotals = sectionTotals(cardRows)

  // TOP 3
  const top3 = [...rows]
    .filter(r => r.item_type1 !== "5")
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)

  const hasData = rows.length > 0

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-gray-800">생활비 관리</h1>
            <select
              className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-blue-400"
              value={yearMonth}
              onChange={e => setYearMonth(e.target.value)}
            >
              {monthOptions.map(m => <option key={m} value={m}>{m.replace("-", "년 ")}월</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            {!loading && !hasData && (
              <button
                onClick={handleCopyPrev}
                className="text-sm text-blue-600 border border-blue-300 rounded px-3 py-1.5 hover:bg-blue-50"
              >
                이전 달 복사
              </button>
            )}
            <button
              onClick={() => setShowCopyMonth(true)}
              className="text-sm text-gray-600 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50"
            >
              생활비 복사
            </button>
            <button
              onClick={() => setShowItemManage(true)}
              className="text-sm text-gray-600 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50"
            >
              입출금 항목 관리
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">불러오는 중...</div>
        ) : (
          <div className="flex gap-4">
            {/* ── 왼쪽 패널 ── */}
            <div className="w-[400px] shrink-0 space-y-3">
              {/* 수입 대비 지출 현황 */}
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <h2 className="text-xs font-semibold text-gray-600 mb-2">수입 대비 지출 현황</h2>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">수입</span>
                    <span className="text-sm font-medium text-blue-600">₩{fmt(income)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">지출</span>
                    <div className="flex items-center gap-3">
                      {cardBill > 0 && <span className="text-xs text-blue-500">카드청구 <span className="font-semibold text-blue-600">{fmt(cardBill)}</span></span>}
                      {expenseCash > 0 && <span className="text-xs text-emerald-600">현금 <span className="font-semibold text-emerald-600">{fmt(expenseCash)}</span></span>}
                      <span className="text-sm font-medium text-red-500">₩{fmt(expense)}</span>
                    </div>
                  </div>
                  <div className="border-t border-gray-100 pt-1.5 flex justify-between items-center">
                    <span className="text-xs font-semibold text-gray-700">잔액</span>
                    <span className={`text-sm font-bold ${balance >= 0 ? "text-blue-600" : "text-red-600"}`}>
                      ₩{fmt(balance)}
                    </span>
                  </div>
                  {cardUsage > 0 && (
                    <div className="border-t border-gray-100 pt-1.5 flex justify-between items-center">
                      <span className="text-xs text-gray-400">카드 사용액 <span className="text-gray-300">· 다음 달 청구</span></span>
                      <span className="text-xs text-gray-400">₩{fmt(cardUsage)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 주요 지출 TOP 3 */}
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <h2 className="text-xs font-semibold text-gray-600 mb-2">주요 지출 TOP 3</h2>
                {top3.length === 0 ? (
                  <p className="text-xs text-gray-400">데이터 없음</p>
                ) : (
                  <div className="space-y-2">
                    {top3.map((r, i) => {
                      const d = diffLabel(r.amount, r.prev_amount)
                      return (
                        <div key={r.id} className="flex items-start justify-between">
                          <div className="flex items-start gap-1.5">
                            <span className="text-xs text-gray-400 mt-0.5">{i + 1}</span>
                            <span className="text-xs text-gray-700 leading-tight">{r.item_nm}</span>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <div className="text-xs font-semibold text-gray-800">{fmt(r.amount)}</div>
                            <div className={`text-xs ${d.cls}`}>{d.text}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 최근 3개월 현황 */}
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <h2 className="text-xs font-semibold text-gray-600 mb-2">최근 3개월 현황</h2>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-100">
                      <th className="py-1 text-left font-normal">월</th>
                      <th className="py-1 text-right font-normal">수입</th>
                      <th className="py-1 text-right font-normal">지출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentMonths.map(rm => (
                      <tr key={rm.yyyymm} className={`border-b border-gray-50 ${rm.yyyymm === yearMonth ? "font-semibold" : ""}`}>
                        <td className="py-1 text-gray-700">{rm.yyyymm}</td>
                        <td className="py-1 text-right text-blue-600">{rm.income ? fmt(rm.income) : "-"}</td>
                        <td className="py-1 text-right text-red-500">{rm.expense ? fmt(rm.expense) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 수입 */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <SectionHeader title="수입" onAdd={() => setAddMonthCategory("5")} />
                {incomeRows.length === 0 ? (
                  <p className="text-xs text-gray-400 px-3 py-3">항목 없음</p>
                ) : (
                  <SectionTable rows={incomeRows} yearMonth={yearMonth} hidePayMethod compact onSaved={load} onDelete={handleDelete} />
                )}
              </div>
            </div>

            {/* ── 오른쪽 패널 ── */}
            <div className="flex-1 min-w-0 space-y-3">
              {/* 고정지출 */}
              <SectionCard title="고정지출" defaultCollapsed onAdd={() => setAddMonthCategory("1")} cardTotal={fixedTotals.card} cashTotal={fixedTotals.cash}>
                {fixedRows.length === 0 ? (
                  <p className="text-xs text-gray-400 px-3 py-3">항목 없음</p>
                ) : (
                  <SectionTable rows={fixedRows} yearMonth={yearMonth} onSaved={load} onDelete={handleDelete} />
                )}
              </SectionCard>

              {/* 고정이체 & 금융 */}
              <SectionCard title="고정이체 & 금융" defaultCollapsed onAdd={() => setAddMonthCategory("2")} cardTotal={transferTotals.card} cashTotal={transferTotals.cash}>
                {transferRows.length === 0 ? (
                  <p className="text-xs text-gray-400 px-3 py-3">항목 없음</p>
                ) : (
                  <SectionTable rows={transferRows} yearMonth={yearMonth} onSaved={load} onDelete={handleDelete} />
                )}
              </SectionCard>

              {/* 생활비 & 공과금 */}
              <SectionCard title="생활비 & 공과금" onAdd={() => setAddMonthCategory("3")} cardTotal={livingTotals.card} cashTotal={livingTotals.cash}>
                {livingRows.length === 0 ? (
                  <p className="text-xs text-gray-400 px-3 py-3">항목 없음</p>
                ) : (
                  <SectionTable rows={livingRows} yearMonth={yearMonth} onSaved={load} onDelete={handleDelete} />
                )}
              </SectionCard>

              {/* 신용카드 */}
              <SectionCard title="신용카드" onAdd={() => setAddMonthCategory("4")} cardTotal={cardSectionTotals.card} cashTotal={cardSectionTotals.cash}>
                {cardRows.length === 0 ? (
                  <p className="text-xs text-gray-400 px-3 py-3">항목 없음</p>
                ) : (
                  <SectionTable rows={cardRows} yearMonth={yearMonth} showSettlement onSaved={load} onDelete={handleDelete} />
                )}
              </SectionCard>
            </div>
          </div>
        )}
      </div>

      {/* 입출금 항목 관리 모달 */}
      {showItemManage && (
        <ItemManageModal
          onClose={() => setShowItemManage(false)}
          onChanged={load}
        />
      )}

      {/* 생활비 복사 모달 */}
      {showCopyMonth && (
        <CopyMonthModal
          yearMonth={yearMonth}
          onClose={() => setShowCopyMonth(false)}
          onCopied={load}
        />
      )}

      {/* 월 항목 추가 모달 */}
      {addMonthCategory && (
        <AddToMonthModal
          yyyymm={yearMonth}
          category={addMonthCategory}
          onClose={() => setAddMonthCategory(null)}
          onAdded={load}
        />
      )}
    </AppLayout>
  )
}
