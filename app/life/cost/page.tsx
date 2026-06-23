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
  getAvailableCostItems,
  addCostInfoItems,
  type MonthDataRow,
  type RecentMonthSummary,
  type CostItem,
} from "./actions"

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────
function fmt(n: number): string {
  return Math.round(n).toLocaleString("ko-KR")
}

const PAY_METHOD_OPTIONS = [
  { label: "-",   value: "" },
  { label: "현금", value: "1" },
  { label: "카드", value: "2" },
]
const PAY_METHOD_COLOR: Record<string, string> = {
  "1": "text-emerald-600 font-medium",
  "2": "text-blue-600 font-medium",
}
function getPayMethodLabel(v: string | null) {
  if (v === "1") return "현금"
  if (v === "2") return "카드"
  return v || "-"
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
  if (row.cost_type) lines.push(`결제수단: ${getPayMethodLabel(row.cost_type)}`)
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


  return (
    <tr
      className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${editing ? "bg-blue-50" : ""}`}
      onClick={() => !editing && setEditing(true)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <td className="py-1.5 px-2 relative">
        <span className="text-gray-700 text-sm">{row.item_nm}</span>
        {hover && <Tooltip row={row} />}
      </td>
      <td className="py-1.5 px-2 text-xs text-gray-500 text-center">
        {row.pay_dd ? `${row.pay_dd}일` : "-"}
      </td>
      <td className="py-1.5 px-2 text-xs text-gray-500 text-center">
        {getPayMethodLabel(row.cost_type)}
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
      {row.item_type1 === "4" && (
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
          onClick={() => { if (confirm(`"${row.item_nm}" 항목을 비활성화하시겠습니까?`)) onDeactivate(row.id) }}
        >✕</button>
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
  const [payMethod, setPayMethod] = useState(item.cost_type ?? "")
  const [payDay, setPayDay] = useState(item.pay_dd != null ? String(item.pay_dd) : "")
  const [amt, setAmt] = useState(Math.round(item.amt).toLocaleString("ko-KR"))
  const [memo, setMemo] = useState(item.memo ?? "")
  const [saving, setSaving] = useState(false)

  async function save(e: React.SyntheticEvent) {
    e.preventDefault()
    setSaving(true)
    await updateCostItemFields(item.id, {
      item_type1: category,
      item_type2: category === "3" ? (building || null) : null,
      item_nm: name,
      cost_type: payMethod || null,
      pay_dd: payDay ? Number(payDay) : null,
      amt: Number(amt.replace(/,/g, "")) || 0,
      memo: memo || null,
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

            {/* 결제수단 · 결제일 · 기본금액 */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">결제수단</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-center text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  value={payMethod} onChange={e => setPayMethod(e.target.value)}
                >
                  {PAY_METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
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
// 항목 관리 모달 행
// ─────────────────────────────────────────────
type ManageRowProps = {
  item: CostItem
  onEdit: (item: CostItem) => void
  onUpdated: () => void
}

function ManageRow({ item, onEdit, onUpdated }: ManageRowProps) {
  async function toggleActive() {
    if (item.use_yn === 'Y') await deactivateCostItem(item.id)
    else await activateCostItem(item.id)
    onUpdated()
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
        <span className={`text-sm ${PAY_METHOD_COLOR[item.cost_type ?? ""] ?? "text-gray-400"}`}>{getPayMethodLabel(item.cost_type)}</span>
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
    </tr>
  )
}

function ItemManageModal({ onClose, onChanged, defaultCategory = "" }: { onClose: () => void; onChanged: () => void; defaultCategory?: string }) {
  const [items, setItems] = useState<CostItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingItem, setEditingItem] = useState<CostItem | null>(null)
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
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
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => (
                  <ManageRow key={item.id} item={item} onEdit={setEditingItem} onUpdated={handleUpdated} />
                ))}
                {filteredItems.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400 text-sm">항목 없음</td></tr>
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
  const [saving, setSaving] = useState(false)

  function set(k: string, v: string | number | null) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!form.item_nm || !form.item_type1) return
    setSaving(true)
    await addCostItem({
      item_type1: form.item_type1!,
      item_type2: form.item_type2 ?? null,
      item_nm: form.item_nm!,
      cost_type: form.cost_type ?? null,
      pay_dd: form.pay_dd ? Number(form.pay_dd) : null,
      amt: Number(form.amt) || 0,
      memo: form.memo ?? null,
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

            {/* 결제수단 · 결제일 · 기본금액 */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">결제수단</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-center text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent" value={form.cost_type ?? ""} onChange={e => set("cost_type", e.target.value)}>
                  {PAY_METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
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
                  value={form.amt !== undefined && form.amt !== null ? String(form.amt) : ""}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9]/g, "")
                    set("amt", raw ? Number(raw) : "")
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
  const [showItemManage, setShowItemManage] = useState(false)
  const [addMonthCategory, setAddMonthCategory] = useState<string | null>(null)
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
    const tabs = [...new Set(rows.filter(r => r.item_type1 === "3" && r.item_type2).map(r => r.item_type2!))]
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
  const income = rows.filter(r => r.item_type1 === "5").reduce((s, r) => s + r.amount, 0)
  const expense = rows.filter(r => r.item_type1 !== "5").reduce((s, r) => s + r.amount, 0)
  const balance = income - expense

  // 카테고리별 그룹
  const fixedRows = rows.filter(r => r.item_type1 === "1")
  const transferRows = rows.filter(r => r.item_type1 === "2")
  const livingRows = rows.filter(r => r.item_type1 === "3")
  const cardRows = rows.filter(r => r.item_type1 === "4")

  const livingTabs = [...new Set(livingRows.map(r => r.item_type2 ?? "기타"))]
  const activeTabRows = livingRows.filter(r => (r.item_type2 ?? "기타") === (activeTab || livingTabs[0]))

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
            </div>

            {/* ── 오른쪽 패널 ── */}
            <div className="flex-1 min-w-0 space-y-3">
              {/* 고정지출 */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <SectionHeader title="고정지출" onAdd={() => setAddMonthCategory("1")} />
                {fixedRows.length === 0 ? (
                  <p className="text-xs text-gray-400 px-3 py-3">항목 없음</p>
                ) : (
                  <SectionTable rows={fixedRows} yearMonth={yearMonth} onSaved={load} onDeactivate={handleDeactivate} />
                )}
              </div>

              {/* 고정이체 & 금융 */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <SectionHeader title="고정이체 & 금융" onAdd={() => setAddMonthCategory("2")} />
                {transferRows.length === 0 ? (
                  <p className="text-xs text-gray-400 px-3 py-3">항목 없음</p>
                ) : (
                  <SectionTable rows={transferRows} yearMonth={yearMonth} onSaved={load} onDeactivate={handleDeactivate} />
                )}
              </div>

              {/* 생활비 & 공과금 */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <SectionHeader title="생활비 & 공과금" onAdd={() => setAddMonthCategory("3")} />
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
                <SectionHeader title="카드결재" onAdd={() => setAddMonthCategory("4")} />
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

      {/* 입출금 항목 관리 모달 */}
      {showItemManage && (
        <ItemManageModal
          onClose={() => setShowItemManage(false)}
          onChanged={load}
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
