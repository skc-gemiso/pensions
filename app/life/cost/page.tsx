"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import AppLayout from "@/components/AppLayout"
import {
  getMonthData,
  getRecentMonths,
  upsertCostInfo,
  addCostItem,
  deactivateCostItem,
  copyFromPrevMonth,
  getAllCostItems,
  updateCostItemFields,
  activateCostItem,
  type MonthDataRow,
  type RecentMonthSummary,
  type CostItem,
} from "./actions"

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString("ko-KR")
}

function getCurrentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}


function buildMonthOptions(): string[] {
  const options: string[] = []
  let d = new Date()
  for (let i = 0; i < 24; i++) {
    options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
    d.setMonth(d.getMonth() - 1)
  }
  return options
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
  if (row.payment_method) lines.push(`결제수단: ${row.payment_method}`)
  if (row.payment_day) lines.push(`결제일: ${row.payment_day}일`)
  if (row.account_no) lines.push(`계좌/사용자번호: ${row.account_no}`)
  if (row.default_amount) lines.push(`기본금액: ${fmt(row.default_amount)}`)
  if (row.category === "카드결재" && row.settlement_start_day && row.settlement_end_day) {
    lines.push(`정산기간: 전월 ${row.settlement_start_day}일 ~ 당월 ${row.settlement_end_day}일`)
  }
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
  onSaved: () => void
  onDeactivate: (id: number) => void
}

function CostRow({ row, yearMonth, onSaved, onDeactivate }: RowProps) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(row.amount))
  const [memo, setMemo] = useState(row.memo ?? "")
  const [hover, setHover] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setVal(String(row.amount))
    setMemo(row.memo ?? "")
  }, [row.amount, row.memo])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function save() {
    await upsertCostInfo(yearMonth, row.id, Number(val.replace(/,/g, "")) || 0, memo || null)
    setEditing(false)
    onSaved()
  }

  const settlementLabel =
    row.category === "카드결재" && row.settlement_start_day && row.settlement_end_day
      ? `전월${row.settlement_start_day}~당월${row.settlement_end_day}`
      : null

  return (
    <tr
      className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${editing ? "bg-blue-50" : ""}`}
      onClick={() => !editing && setEditing(true)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <td className="py-1.5 px-2 relative">
        <span className="text-gray-700 text-sm">{row.name}</span>
        {hover && <Tooltip row={row} />}
      </td>
      {row.category === "카드결재" && (
        <td className="py-1.5 px-2 text-xs text-gray-500 text-center">{settlementLabel}</td>
      )}
      <td className="py-1.5 px-2 text-xs text-gray-500 text-center">
        {row.payment_day ? `${row.payment_day}일` : "-"}
      </td>
      <td className="py-1.5 px-2 text-xs text-gray-500 text-center">
        {row.payment_method ?? "-"}
      </td>
      <td className="py-1.5 px-2 text-right min-w-[90px]" onClick={e => e.stopPropagation()}>
        {editing ? (
          <input
            ref={inputRef}
            className="w-24 text-right border border-blue-400 rounded px-1 py-0.5 text-sm focus:outline-none"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") save()
              if (e.key === "Escape") setEditing(false)
              if (e.key === "Tab") { e.preventDefault(); save() }
            }}
            onBlur={save}
          />
        ) : (
          <span className="text-sm font-medium text-gray-800">
            {row.amount === 0 ? <span className="text-gray-400">-</span> : fmt(row.amount)}
          </span>
        )}
      </td>
      {row.category === "카드결재" && (
        <td className="py-1.5 px-2 text-xs text-center">
          {(() => { const d = diffLabel(row.amount, row.prev_amount); return <span className={d.cls}>{d.text}</span> })()}
        </td>
      )}
      <td className="py-1.5 px-2 text-xs text-gray-500 max-w-[120px] truncate">
        {editing ? (
          <input
            className="w-full border border-gray-300 rounded px-1 py-0.5 text-xs focus:outline-none"
            value={memo}
            onChange={e => setMemo(e.target.value)}
            onClick={e => e.stopPropagation()}
            onBlur={save}
          />
        ) : (
          row.memo
        )}
      </td>
      <td className="py-1.5 px-2 text-center" onClick={e => e.stopPropagation()}>
        <button
          className="text-xs text-gray-400 hover:text-red-500"
          onClick={() => { if (confirm(`"${row.name}" 항목을 비활성화하시겠습니까?`)) onDeactivate(row.id) }}
        >✕</button>
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────
// 카테고리 옵션 (항목 관리 모달용)
// ─────────────────────────────────────────────
const CATEGORY_MANAGE_OPTIONS = [
  { label: "고정지출",      value: "고정지출" },
  { label: "고정이체",      value: "고정이체" },
  { label: "생활비/공과금", value: "생활비" },
  { label: "카드결재",      value: "카드결재" },
  { label: "수입",          value: "기타수입" },
]

// ─────────────────────────────────────────────
// 항목 추가 모달
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// 항목 관리 모달
// ─────────────────────────────────────────────
type ManageRowProps = {
  item: CostItem
  onUpdated: () => void
}

function ManageRow({ item, onUpdated }: ManageRowProps) {
  const [editing, setEditing] = useState(false)
  const [category, setCategory] = useState(item.category)
  const [name, setName] = useState(item.name)
  const [payMethod, setPayMethod] = useState(item.payment_method ?? "")
  const [payDay, setPayDay] = useState(item.payment_day != null ? String(item.payment_day) : "")
  const [amt, setAmt] = useState(String(item.default_amount))

  async function save() {
    await updateCostItemFields(item.id, {
      category,
      name,
      payment_method: payMethod || null,
      payment_day: payDay ? Number(payDay) : null,
      default_amount: Number(amt.replace(/,/g, "")) || 0,
    })
    setEditing(false)
    onUpdated()
  }

  async function toggleActive() {
    if (item.is_active) await deactivateCostItem(item.id)
    else await activateCostItem(item.id)
    onUpdated()
  }

  const rowCls = `border-b border-gray-100 text-sm ${!item.is_active ? "opacity-40" : "hover:bg-gray-50"}`
  const categoryLabel = CATEGORY_MANAGE_OPTIONS.find(o => o.value === category)?.label ?? category

  return (
    <tr className={rowCls}>
      <td className="px-2 py-1.5 whitespace-nowrap">
        {editing
          ? <select
              className="border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-blue-400"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {CATEGORY_MANAGE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          : <span className="text-xs text-gray-500">{categoryLabel}</span>}
      </td>
      <td className="px-2 py-1.5">
        {editing
          ? <input className="w-full border rounded px-1.5 py-0.5 text-sm focus:outline-none focus:border-blue-400" value={name} onChange={e => setName(e.target.value)} />
          : <span className="text-gray-800">{item.name}</span>}
      </td>
      <td className="px-2 py-1.5">
        {editing
          ? <input className="w-full border rounded px-1.5 py-0.5 text-sm focus:outline-none focus:border-blue-400" value={payMethod} onChange={e => setPayMethod(e.target.value)} placeholder="-" />
          : <span className="text-gray-600">{item.payment_method ?? "-"}</span>}
      </td>
      <td className="px-2 py-1.5 text-center">
        {editing
          ? <input type="number" min={1} max={31} className="w-14 border rounded px-1.5 py-0.5 text-sm text-center focus:outline-none focus:border-blue-400" value={payDay} onChange={e => setPayDay(e.target.value)} placeholder="-" />
          : <span className="text-gray-600">{item.payment_day ?? "-"}</span>}
      </td>
      <td className="px-2 py-1.5 text-right">
        {editing
          ? <input className="w-24 border rounded px-1.5 py-0.5 text-sm text-right focus:outline-none focus:border-blue-400" value={amt} onChange={e => setAmt(e.target.value)} />
          : <span className="text-gray-700 font-medium">{item.default_amount ? fmt(item.default_amount) : "-"}</span>}
      </td>
      <td className="px-2 py-1.5 text-center whitespace-nowrap">
        {editing ? (
          <span className="flex gap-1 justify-center">
            <button onClick={save} className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700">저장</button>
            <button onClick={() => setEditing(false)} className="text-xs px-2 py-0.5 border text-gray-600 rounded hover:bg-gray-50">취소</button>
          </span>
        ) : (
          <button onClick={() => setEditing(true)} className="text-xs px-2 py-0.5 border text-gray-600 rounded hover:bg-gray-50">수정</button>
        )}
      </td>
      <td className="px-2 py-1.5 text-center">
        <button
          onClick={toggleActive}
          className={`text-xs px-2 py-0.5 rounded border ${item.is_active ? "text-red-500 border-red-200 hover:bg-red-50" : "text-green-600 border-green-200 hover:bg-green-50"}`}
        >
          {item.is_active ? "비활성" : "활성화"}
        </button>
      </td>
    </tr>
  )
}

function ItemManageModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<CostItem[]>([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-700">항목 관리</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <div className="overflow-auto flex-1 px-1">
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="text-xs text-gray-500 border-b border-gray-200">
                  <th className="px-2 py-2 text-left font-medium">구분</th>
                  <th className="px-2 py-2 text-left font-medium">항목명</th>
                  <th className="px-2 py-2 text-left font-medium">결제수단</th>
                  <th className="px-2 py-2 text-center font-medium">결제일</th>
                  <th className="px-2 py-2 text-right font-medium">기본금액</th>
                  <th className="px-2 py-2 text-center font-medium">수정</th>
                  <th className="px-2 py-2 text-center font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <ManageRow key={item.id} item={item} onUpdated={handleUpdated} />
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">항목 없음</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="text-sm px-4 py-1.5 border rounded text-gray-600 hover:bg-gray-50">닫기</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
type AddModalProps = {
  defaultCategory: string
  onClose: () => void
  onAdded: () => void
}

const CATEGORIES = ["고정지출", "고정이체", "생활비", "카드결재", "기타수입"]

function AddItemModal({ defaultCategory, onClose, onAdded }: AddModalProps) {
  const [form, setForm] = useState<Partial<CostItem & { category: string }>>({ category: defaultCategory })
  const [saving, setSaving] = useState(false)

  function set(k: string, v: string | number | null) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!form.name || !form.category) return
    setSaving(true)
    await addCostItem({
      category: form.category!,
      sub_category: form.sub_category ?? null,
      name: form.name!,
      payment_method: form.payment_method ?? null,
      payment_day: form.payment_day ? Number(form.payment_day) : null,
      default_amount: Number(form.default_amount) || 0,
      account_no: form.account_no ?? null,
      settlement_start_day: form.settlement_start_day ? Number(form.settlement_start_day) : null,
      settlement_end_day: form.settlement_end_day ? Number(form.settlement_end_day) : null,
    })
    setSaving(false)
    onAdded()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h3 className="text-base font-bold text-gray-700 mb-4">항목 추가</h3>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-700">카테고리 *</label>
              <select className="w-full border rounded px-2 py-1.5 text-sm mt-1" value={form.category ?? ""} onChange={e => set("category", e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            {form.category === "생활비" && (
              <div>
                <label className="text-sm text-gray-700">건물명(탭)</label>
                <input className="w-full border rounded px-2 py-1.5 text-sm mt-1" value={form.sub_category ?? ""} onChange={e => set("sub_category", e.target.value)} />
              </div>
            )}
          </div>
          <div>
            <label className="text-sm text-gray-700">항목명 *</label>
            <input required className="w-full border rounded px-2 py-1.5 text-sm mt-1" value={form.name ?? ""} onChange={e => set("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-700">결제수단</label>
              <input className="w-full border rounded px-2 py-1.5 text-sm mt-1" value={form.payment_method ?? ""} onChange={e => set("payment_method", e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-700">결제일</label>
              <input type="number" min={1} max={31} className="w-full border rounded px-2 py-1.5 text-sm mt-1" value={form.payment_day ?? ""} onChange={e => set("payment_day", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-700">기본금액</label>
              <input type="number" className="w-full border rounded px-2 py-1.5 text-sm mt-1" value={form.default_amount ?? ""} onChange={e => set("default_amount", e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-700">계좌/사용자번호</label>
              <input className="w-full border rounded px-2 py-1.5 text-sm mt-1" value={form.account_no ?? ""} onChange={e => set("account_no", e.target.value)} />
            </div>
          </div>
          {form.category === "카드결재" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-700">정산 시작일 (전월)</label>
                <input type="number" min={1} max={31} className="w-full border rounded px-2 py-1.5 text-sm mt-1" value={form.settlement_start_day ?? ""} onChange={e => set("settlement_start_day", e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-700">정산 종료일 (당월)</label>
                <input type="number" min={1} max={31} className="w-full border rounded px-2 py-1.5 text-sm mt-1" value={form.settlement_end_day ?? ""} onChange={e => set("settlement_end_day", e.target.value)} />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 border rounded hover:bg-gray-50">취소</button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
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
function SectionHeader({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
      <span className="text-sm font-semibold text-gray-700">{title}</span>
      <button onClick={onAdd} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ 항목추가</button>
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
  onSaved: () => void
  onDeactivate: (id: number) => void
}

function SectionTable({ rows, yearMonth, showSettlement, onSaved, onDeactivate }: SectionTableProps) {
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-gray-500 border-b border-gray-200">
          <th className="py-1 px-2 text-left">항목명</th>
          {showSettlement && <th className="py-1 px-2 text-center">정산기간</th>}
          <th className="py-1 px-2 text-center">날짜</th>
          <th className="py-1 px-2 text-center">결제수단</th>
          <th className="py-1 px-2 text-right">금액</th>
          {showSettlement && <th className="py-1 px-2 text-center">전월대비</th>}
          <th className="py-1 px-2 text-left">메모</th>
          <th className="py-1 px-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <CostRow key={row.id} row={row} yearMonth={yearMonth} onSaved={onSaved} onDeactivate={onDeactivate} />
        ))}
      </tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-50">
            <td colSpan={showSettlement ? 4 : 3} className="py-1 px-2 text-xs text-gray-500 text-right">합계</td>
            <td className="py-1 px-2 text-right text-sm font-semibold text-gray-700">{fmt(total)}</td>
            <td colSpan={showSettlement ? 3 : 2}></td>
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
  const [addModalCategory, setAddModalCategory] = useState<string | null>(null)
  const [showItemManage, setShowItemManage] = useState(false)
  const [activeTab, setActiveTab] = useState<string>("")
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

  // 탭 초기값 설정
  useEffect(() => {
    const tabs = [...new Set(rows.filter(r => r.category === "생활비" && r.sub_category).map(r => r.sub_category!))]
    if (tabs.length > 0 && !tabs.includes(activeTab)) setActiveTab(tabs[0])
  }, [rows])

  async function handleDeactivate(id: number) {
    await deactivateCostItem(id)
    load()
  }

  async function handleCopyPrev() {
    if (!confirm("이전 달 데이터를 복사하시겠습니까?")) return
    await copyFromPrevMonth(yearMonth)
    load()
  }

  // 집계
  const income = rows.filter(r => r.category === "기타수입").reduce((s, r) => s + r.amount, 0)
  const expense = rows.filter(r => r.category !== "기타수입").reduce((s, r) => s + r.amount, 0)
  const balance = income - expense

  // 카테고리별 그룹
  const fixedRows = rows.filter(r => r.category === "고정지출")
  const transferRows = rows.filter(r => r.category === "고정이체")
  const livingRows = rows.filter(r => r.category === "생활비")
  const cardRows = rows.filter(r => r.category === "카드결재")

  const livingTabs = [...new Set(livingRows.map(r => r.sub_category ?? "기타"))]
  const activeTabRows = livingRows.filter(r => (r.sub_category ?? "기타") === (activeTab || livingTabs[0]))

  // TOP 3
  const top3 = [...rows]
    .filter(r => r.category !== "기타수입")
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)

  const hasData = rows.some(r => r.amount > 0)

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowItemManage(true)}
              className="text-sm text-gray-600 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50"
            >
              항목 관리
            </button>
            <h1 className="text-lg font-bold text-gray-800">생활비 관리</h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-blue-400"
              value={yearMonth}
              onChange={e => setYearMonth(e.target.value)}
            >
              {monthOptions.map(m => <option key={m} value={m}>{m.replace("-", "년 ")}월</option>)}
            </select>
            {!loading && !hasData && (
              <button
                onClick={handleCopyPrev}
                className="text-sm text-blue-600 border border-blue-300 rounded px-3 py-1.5 hover:bg-blue-50"
              >
                이전 달 복사
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">불러오는 중...</div>
        ) : (
          <div className="flex gap-4">
            {/* ── 왼쪽 패널 ── */}
            <div className="w-64 shrink-0 space-y-3">
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
                    <span className="text-sm font-medium text-red-500">₩{fmt(expense)}</span>
                  </div>
                  <div className="border-t border-gray-100 pt-1.5 flex justify-between items-center">
                    <span className="text-xs font-semibold text-gray-700">잔액</span>
                    <span className={`text-sm font-bold ${balance >= 0 ? "text-blue-600" : "text-red-600"}`}>
                      ₩{fmt(balance)}
                    </span>
                  </div>
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
                            <span className="text-xs text-gray-700 leading-tight">{r.name}</span>
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
            </div>

            {/* ── 오른쪽 패널 ── */}
            <div className="flex-1 min-w-0 space-y-3">
              {/* 고정지출 */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <SectionHeader title="고정지출" onAdd={() => setAddModalCategory("고정지출")} />
                {fixedRows.length === 0 ? (
                  <p className="text-xs text-gray-400 px-3 py-3">항목 없음</p>
                ) : (
                  <SectionTable rows={fixedRows} yearMonth={yearMonth} onSaved={load} onDeactivate={handleDeactivate} />
                )}
              </div>

              {/* 고정이체 & 금융 */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <SectionHeader title="고정이체 & 금융" onAdd={() => setAddModalCategory("고정이체")} />
                {transferRows.length === 0 ? (
                  <p className="text-xs text-gray-400 px-3 py-3">항목 없음</p>
                ) : (
                  <SectionTable rows={transferRows} yearMonth={yearMonth} onSaved={load} onDeactivate={handleDeactivate} />
                )}
              </div>

              {/* 생활비 & 공과금 */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <SectionHeader title="생활비 & 공과금" onAdd={() => setAddModalCategory("생활비")} />
                {livingTabs.length > 1 && (
                  <div className="flex gap-1 px-3 pt-2 border-b border-gray-200">
                    {livingTabs.map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`text-xs px-3 py-1 rounded-t border-b-2 transition-colors ${(activeTab || livingTabs[0]) === tab ? "border-blue-500 text-blue-600 font-semibold" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                )}
                {livingRows.length === 0 ? (
                  <p className="text-xs text-gray-400 px-3 py-3">항목 없음</p>
                ) : (
                  <SectionTable rows={activeTabRows} yearMonth={yearMonth} onSaved={load} onDeactivate={handleDeactivate} />
                )}
              </div>

              {/* 카드결재 */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <SectionHeader title="카드결재" onAdd={() => setAddModalCategory("카드결재")} />
                {cardRows.length === 0 ? (
                  <p className="text-xs text-gray-400 px-3 py-3">항목 없음</p>
                ) : (
                  <SectionTable rows={cardRows} yearMonth={yearMonth} showSettlement onSaved={load} onDeactivate={handleDeactivate} />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 항목 관리 모달 */}
      {showItemManage && (
        <ItemManageModal
          onClose={() => setShowItemManage(false)}
          onChanged={load}
        />
      )}

      {/* 항목 추가 모달 */}
      {addModalCategory && (
        <AddItemModal
          defaultCategory={addModalCategory}
          onClose={() => setAddModalCategory(null)}
          onAdded={load}
        />
      )}
    </AppLayout>
  )
}
