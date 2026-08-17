"use client"

import { useCallback, useEffect, useState } from "react"
import AppLayout from "@/components/AppLayout"
import { fmt, cc } from "@/lib/fmt"
import {
  getBills, upsertBill, deleteBill,
  getDailyUsage, upsertDailyUsage, applyDailyTotalToBill, setTargetKwh,
  getRates, upsertRate, deleteRate,
  type PowerBill, type PowerRateRow, type DailyView,
} from "./actions"

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────
const TABS = [
  { key: "bill",  label: "월별 청구" },
  { key: "daily", label: "일별 사용량" },
  { key: "rate",  label: "요금표 관리" },
] as const
type TabKey = typeof TABS[number]["key"]

const SEASON_LABEL: Record<string, string> = { S: "여름", O: "기타계절" }

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmtYM(yyyymm: string): string {
  const [y, m] = yyyymm.split("-")
  return `${y}년 ${Number(m)}월`
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

/** 0=일 … 6=토 (UTC 기준으로 저장·표시한다) */
function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay()
}

/** 달이 바뀌는 날(1일)이면 'M월', 아니면 null */
function monthMark(iso: string): string | null {
  return iso.slice(8, 10) === "01" ? `${Number(iso.slice(5, 7))}월` : null
}

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"

// ─────────────────────────────────────────────
// 월별 청구 — 입력 폼
// ─────────────────────────────────────────────
type BillFormState = {
  yyyymm: string
  usage_kwh: string
  season_discount: string
  welfare_yn: boolean
}

const EMPTY_BILL_FORM: BillFormState = {
  yyyymm: "", usage_kwh: "", season_discount: "", welfare_yn: true,
}

function BillModal({ initial, onClose, onSaved }: {
  initial: BillFormState
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof BillFormState>(k: K, v: BillFormState[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  async function save(e: React.SyntheticEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await upsertBill({
        yyyymm: form.yyyymm,
        usage_kwh: Number(form.usage_kwh.replace(/,/g, "")) || 0,
        // 화면은 양수로 받고 저장은 음수 (고지서 표기와 동일)
        season_discount: -Math.abs(Number(form.season_discount.replace(/,/g, "")) || 0),
        welfare_yn: form.welfare_yn ? "Y" : "N",
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했습니다.")
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-base font-bold text-gray-800">전기요금 청구 입력</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <form onSubmit={save}>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">요금월 <span className="text-red-400">*</span></label>
                <input required type="month" className={inputCls} value={form.yyyymm} onChange={e => set("yyyymm", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">사용량(kWh) <span className="text-red-400">*</span></label>
                <input
                  required type="text" inputMode="decimal" placeholder="288"
                  className={`${inputCls} text-right`}
                  value={form.usage_kwh}
                  onChange={e => set("usage_kwh", e.target.value.replace(/[^0-9.]/g, ""))}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">하계/동계 할인</label>
              {/* 할인이므로 양수로 입력받고 저장할 때 음수로 바꾼다 */}
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400 text-lg leading-none shrink-0">−</span>
                <input
                  type="text" inputMode="numeric" placeholder="0"
                  className={`${inputCls} text-right`}
                  value={form.season_discount}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9]/g, "")
                    set("season_discount", raw ? Number(raw).toLocaleString("ko-KR") : "")
                  }}
                />
                <span className="text-gray-500 text-sm shrink-0">원</span>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-blue-600"
                checked={form.welfare_yn}
                onChange={e => set("welfare_yn", e.target.checked)}
              />
              <span className="text-sm text-gray-700">장애인 복지할인 적용</span>
            </label>

            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 월별 청구 — 계산 상세
// ─────────────────────────────────────────────
/** 계절 일수를 가로 막대로 — 어느 계절이 얼마나 걸쳤는지 한눈에 */
function DayBar({ otherDays, summerDays, totalDays, summerLabel }: {
  otherDays: number
  summerDays: number
  totalDays: number
  summerLabel: string
}) {
  const pct = (d: number) => (totalDays > 0 ? (d / totalDays) * 100 : 0)
  return (
    <div className="flex h-5 rounded overflow-hidden border border-gray-200 bg-gray-100">
      {otherDays > 0 && (
        <div
          className="bg-blue-100 text-blue-700 text-[10px] font-medium flex items-center justify-center"
          style={{ width: `${pct(otherDays)}%` }}
        >
          기타 {otherDays}일
        </div>
      )}
      {summerDays > 0 && (
        <div
          className="bg-red-100 text-red-700 text-[10px] font-medium flex items-center justify-center"
          style={{ width: `${pct(summerDays)}%` }}
        >
          {summerLabel} {summerDays}일
        </div>
      )}
    </div>
  )
}

/** 한전 고지서와 같은 순서·명칭으로 계산 과정을 보여준다 */
function BillDetail({ bill }: { bill: PowerBill }) {
  const c = bill.calc

  const row = (label: string, value: string, opts?: { strong?: boolean; color?: string; note?: string }) => (
    <div className="px-4">
      <div className="flex justify-between items-baseline py-1">
        <span className={`text-xs ${opts?.strong ? "font-semibold text-gray-700" : "text-gray-500"}`}>{label}</span>
        <span className={`text-sm tabular-nums ${opts?.color ?? "text-gray-800"} ${opts?.strong ? "font-semibold" : ""}`}>
          {value}
        </span>
      </div>
      {opts?.note && <p className="text-[11px] text-gray-400 -mt-1 pb-1 leading-snug">{opts.note}</p>}
    </div>
  )
  const divider = <div className="border-t border-gray-200 my-1" />

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden sticky top-4">
      {/* 헤더 */}
      <div className="px-4 py-3 bg-gradient-to-r from-slate-700 to-slate-600">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-white font-bold text-base leading-tight">{fmtYM(bill.yyyymm)}</p>
            <p className="text-slate-300 text-xs mt-0.5">
              {bill.period_start} ~ {bill.period_end}
              {c && <span className="ml-1">· {c.totalDays}일</span>}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-slate-300 text-[11px]">청구금액</p>
            <p className="text-white font-bold text-xl leading-tight tabular-nums">
              {c ? fmt(c.total) : "-"}<span className="text-sm font-normal ml-0.5">원</span>
            </p>
          </div>
        </div>
      </div>

      {!c ? (
        <p className="text-xs text-red-500 px-4 py-4">적용할 요금표가 없습니다. 요금표 관리 탭에서 등록하세요.</p>
      ) : (
        <>
          {/* 핵심 수치 */}
          <div className="grid grid-cols-3 divide-x divide-gray-200 border-b border-gray-200 bg-gray-50">
            {[
              { label: "사용량", value: fmt(bill.usage_kwh, 1), unit: "kWh", cls: "text-gray-800" },
              { label: "전기요금계", value: fmt(c.taxable), unit: "원", cls: "text-gray-800" },
              { label: "할인 합계", value: fmt(c.welfareDiscount + c.seasonDiscount), unit: "원", cls: "text-blue-600" },
            ].map(s => (
              <div key={s.label} className="px-3 py-2.5 text-center">
                <p className="text-[11px] text-gray-500 mb-0.5">{s.label}</p>
                <p className={`text-lg font-bold tabular-nums ${s.cls}`}>
                  {s.value}<span className="text-xs font-normal text-gray-400 ml-0.5">{s.unit}</span>
                </p>
              </div>
            ))}
          </div>

          {/* 계절 일수 · 구간 안분 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 px-4 py-3 border-b border-gray-200">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600">계절 일수 · 총 {c.totalDays}일</p>
              <div>
                <p className="text-[11px] text-gray-500 mb-1">전력량 요금</p>
                <DayBar
                  otherDays={c.totalDays - c.segments.filter(s => s.season === "S").reduce((a, s) => a + s.days, 0)}
                  summerDays={c.segments.filter(s => s.season === "S").reduce((a, s) => a + s.days, 0)}
                  totalDays={c.totalDays}
                  summerLabel="여름"
                />
              </div>
              {c.applyWelfare && (
                <div>
                  <p className="text-[11px] text-gray-500 mb-1">복지할인</p>
                  <DayBar
                    otherDays={c.welfareDays.otherDays}
                    summerDays={c.welfareDays.summerDays}
                    totalDays={c.welfareDays.totalDays}
                    summerLabel="하계"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-600">구간 안분 내역</p>
              {c.segments.map(s => (
                <div key={s.season} className="flex items-center gap-2 text-[11px] bg-gray-50 border border-gray-200 rounded px-2 py-1.5">
                  <span className={`font-semibold shrink-0 ${s.season === "S" ? "text-red-600" : "text-blue-600"}`}>
                    {SEASON_LABEL[s.season]} {s.days}일
                  </span>
                  <span className="text-gray-600 font-medium">{fmt(s.usage, 1)}kWh</span>
                  <span className="text-gray-400">상한 {fmt(s.tier1_limit, 0)}</span>
                  <span className="font-medium text-gray-700">{s.tier}구간</span>
                  <span className="ml-auto text-gray-800 tabular-nums font-medium">{fmt(Math.round(s.energy))}원</span>
                </div>
              ))}
            </div>
          </div>

          {/* 고지서 순서 — 좌: 요금 구성 / 우: 할인·세금·청구 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 py-3">
            <div>
              <p className="px-4 text-xs font-semibold text-gray-600 mb-1">요금 구성</p>
              {row("기본요금", `${fmt(c.baseCharge)}원`)}
              {row("전력량요금", `${fmt(c.energyCharge)}원`)}
              {row("기후환경요금", `${fmt(c.envCharge)}원`)}
              {row("연료비조정요금", `${fmt(c.fuelCharge)}원`)}
              {divider}
              {row("전기요금 (할인 전)", `${fmt(c.chargeBefore)}원`, { strong: true })}
            </div>

            <div className="border-t md:border-t-0 md:border-l border-gray-200 pt-3 md:pt-0 mt-2 md:mt-0">
              <p className="px-4 text-xs font-semibold text-gray-600 mb-1">할인 · 세금</p>
              {row("복지할인요금", c.applyWelfare ? `${fmt(c.welfareDiscount)}원` : "미적용", {
                color: c.applyWelfare ? "text-blue-600" : "text-gray-400",
              })}
              {row("하계/동계 할인", `${fmt(c.seasonDiscount)}원`, {
                color: c.seasonDiscount ? "text-indigo-600" : "text-gray-400",
              })}
              {divider}
              {row("전기요금계", `${fmt(c.taxable)}원`, { strong: true })}
              {row("부가가치세", `${fmt(c.vat)}원`)}
              {row("전력기금", `${fmt(c.fund)}원`)}
              <div className="border-t-2 border-gray-300 mt-1 pt-1">
                <div className="px-4 flex justify-between items-baseline py-1">
                  <span className="text-sm font-bold text-gray-700">청구금액</span>
                  <span className="text-xl font-bold text-red-600 tabular-nums">{fmt(c.total)}원</span>
                </div>
                <p className="px-4 text-[11px] text-gray-400">
                  원단위 절사 {fmt(c.taxable + c.vat + c.fund - c.total)}원
                </p>
              </div>
            </div>
          </div>

        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 탭 1 — 월별 청구
// ─────────────────────────────────────────────
function BillTab({ bills, loading, onChanged }: {
  bills: PowerBill[]
  loading: boolean
  onChanged: () => void
}) {
  const [editing, setEditing] = useState<BillFormState | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  // 목록이 오면 가장 최근 건을 자동 선택. 선택한 건이 사라지면(삭제) 다시 최근 건으로
  useEffect(() => {
    if (bills.length === 0) { setSelected(null); return }
    if (!selected || !bills.some(b => b.yyyymm === selected)) setSelected(bills[0].yyyymm)
  }, [bills, selected])

  function openNew() {
    setEditing({ ...EMPTY_BILL_FORM, yyyymm: todayISO().slice(0, 7) })
  }

  function openEdit(b: PowerBill) {
    setEditing({
      yyyymm: b.yyyymm,
      usage_kwh: String(b.usage_kwh),
      season_discount: b.season_discount ? Math.abs(b.season_discount).toLocaleString("ko-KR") : "",
      welfare_yn: b.welfare_yn !== "N",
    })
  }

  async function handleDelete(b: PowerBill) {
    if (!confirm(`${fmtYM(b.yyyymm)} 청구를 삭제합니다.\n\n⚠ 해당 월의 일별 사용량도 함께 삭제되며 되돌릴 수 없습니다.`)) return
    await deleteBill(b.yyyymm)
    onChanged()
  }

  const selectedBill = bills.find(b => b.yyyymm === selected) ?? null

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* 좌: 목록 (좁게) */}
      <div className="w-full lg:w-[300px] shrink-0 bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <span className="text-sm font-semibold text-gray-700">월별 청구</span>
          <button onClick={openNew} className="text-xs text-blue-600 border border-blue-300 rounded px-3 py-1 hover:bg-blue-50">
            + 청구 입력
          </button>
        </div>

        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
        ) : bills.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">등록된 청구가 없습니다</div>
        ) : (
          <div className="max-h-[calc(100vh-14rem)] overflow-y-auto divide-y divide-gray-100">
            {bills.map(b => {
              const on = b.yyyymm === selected
              return (
                <div
                  key={b.yyyymm}
                  onClick={() => setSelected(b.yyyymm)}
                  className={`group relative px-3 py-2 cursor-pointer transition-colors ${
                    on ? "bg-blue-50" : "hover:bg-gray-50"
                  }`}
                >
                  {/* 선택 표시 */}
                  <span className={`absolute left-0 top-0 bottom-0 w-1 ${on ? "bg-blue-500" : "bg-transparent"}`} />

                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-sm font-semibold ${on ? "text-blue-700" : "text-gray-800"}`}>
                      {b.yyyymm}
                    </span>
                    <span className="text-sm font-bold text-red-600 tabular-nums">
                      {b.calc ? `${fmt(b.calc.total)}원` : "-"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <div className="flex items-center gap-1.5 text-[11px] min-w-0">
                      <span className="text-gray-600 tabular-nums shrink-0">{fmt(b.usage_kwh, 1)}kWh</span>
                      {b.calc && (
                        <span className="text-blue-500 tabular-nums shrink-0">복지 {fmt(b.calc.welfareDiscount)}</span>
                      )}
                      {!!b.season_discount && (
                        <span className="text-indigo-500 tabular-nums shrink-0">하계/동계 {fmt(b.season_discount)}</span>
                      )}
                    </div>
                    <div
                      className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0"
                      onClick={e => e.stopPropagation()}
                    >
                      <button onClick={() => openEdit(b)} className="text-[11px] px-1.5 py-0.5 border text-gray-600 rounded hover:bg-white">수정</button>
                      <button onClick={() => handleDelete(b)} className="text-[11px] px-1.5 py-0.5 border text-gray-500 border-gray-300 rounded hover:bg-red-50 hover:text-red-600 hover:border-red-300">삭제</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 우: 선택한 청구의 계산 내역 (넓게) */}
      <div className="flex-1 min-w-0 w-full">
        {selectedBill ? (
          <BillDetail bill={selectedBill} />
        ) : (
          <div className="bg-white border border-dashed border-gray-300 rounded-lg py-10 text-center text-sm text-gray-400">
            청구를 선택하면 계산 내역이 표시됩니다
          </div>
        )}
      </div>

      {editing && (
        <BillModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 탭 2 — 일별 사용량
// ─────────────────────────────────────────────
function DailyTab({ bills, onChanged }: { bills: PowerBill[]; onChanged: () => void }) {
  const [yyyymm, setYyyymm] = useState<string>("")
  const [view, setView] = useState<DailyView | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!yyyymm && bills.length > 0) setYyyymm(bills[0].yyyymm)
  }, [bills, yyyymm])

  const reload = useCallback(async () => {
    if (!yyyymm) { setView(null); return }
    setLoading(true)
    setView(await getDailyUsage(yyyymm))
    setLoading(false)
  }, [yyyymm])

  useEffect(() => { reload() }, [reload])

  async function saveDay(useDate: string, raw: string) {
    const v = raw.trim()
    await upsertDailyUsage(yyyymm, useDate, v === "" ? null : Number(v))
    await reload()
  }

  async function applyTotal() {
    if (!view) return
    if (!confirm(`일별 합계 ${fmt(view.total, 1)}kWh 를 ${fmtYM(yyyymm)} 청구의 사용량으로 반영합니다.`)) return
    await applyDailyTotalToBill(yyyymm)
    await reload()
    onChanged()
  }

  // 비우면 구간 경계로 자동 설정
  async function saveTarget(target: number | null) {
    await setTargetKwh(yyyymm, target)
    await reload()
    onChanged()
  }

  const billTarget = bills.find(b => b.yyyymm === yyyymm)?.target_kwh ?? null

  const avg = view && view.filledDays > 0 ? view.total / view.filledDays : 0
  const forecast = view && view.filledDays > 0 ? avg * view.totalDays : 0

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-700">일별 사용량</span>
        <select
          className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 bg-white focus:outline-none focus:border-blue-400"
          value={yyyymm}
          onChange={e => setYyyymm(e.target.value)}
        >
          {bills.map(b => <option key={b.yyyymm} value={b.yyyymm}>{b.yyyymm}</option>)}
        </select>
        {view && (
          <span className="text-xs text-gray-500">{view.period_start} ~ {view.period_end}</span>
        )}
        {view && (
          <button onClick={applyTotal} className="ml-auto text-xs text-blue-600 border border-blue-300 rounded px-3 py-1 hover:bg-blue-50">
            합계를 청구 사용량으로 반영
          </button>
        )}
      </div>

      {bills.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">먼저 월별 청구를 등록하세요</div>
      ) : loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
      ) : !view || view.rows.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">데이터 없음</div>
      ) : (
        <>
          {/* 요약 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 bg-blue-50/50 border-b border-blue-100">
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-0.5">합계</p>
              <p className="text-lg font-bold text-gray-800">{fmt(view.total, 1)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-0.5">목표</p>
              <input
                type="text" inputMode="decimal"
                className="w-20 mx-auto block text-center text-lg font-bold text-blue-600 bg-transparent border border-transparent hover:border-blue-200 focus:border-blue-400 focus:bg-white rounded px-1 focus:outline-none"
                defaultValue={String(view.target)}
                key={`${view.yyyymm}-${view.target}`}
                onBlur={e => {
                  const v = e.target.value.trim()
                  if (v === String(view.target)) return
                  saveTarget(v === "" ? null : Number(v))
                }}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
              />
              <p className="text-xs text-gray-400">{billTarget == null ? "구간 경계 자동" : "직접 지정"}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-0.5">잔여량</p>
              <p className={`text-lg font-bold ${view.remain < 0 ? "text-red-600" : "text-emerald-600"}`}>
                {fmt(view.remain, 1)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-0.5">일평균 · 예상</p>
              <p className="text-sm font-semibold text-gray-700">
                {fmt(avg, 1)} · <span className={cc(view.target - forecast)}>{fmt(forecast, 1)}</span>
              </p>
              <p className="text-xs text-gray-400">{view.filledDays}/{view.totalDays}일 입력</p>
            </div>
          </div>

          {/* 달력 — 사용기간을 요일에 맞춰 주 단위로 배치 */}
          <div className="p-3">
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((w, i) => (
                <div
                  key={w}
                  className={`text-center text-xs font-semibold py-1 ${
                    i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"
                  }`}
                >{w}</div>
              ))}

              {/* 첫 날 요일까지 빈 칸 */}
              {Array.from({ length: weekdayOf(view.rows[0].use_date) }, (_, i) => (
                <div key={`pad-${i}`} />
              ))}

              {view.rows.map(r => {
                const dow = weekdayOf(r.use_date)
                const mark = monthMark(r.use_date)
                const v = r.usage_kwh
                const high = v != null && avg > 0 && v >= avg * 1.5
                return (
                  <div
                    key={r.use_date}
                    className={`border rounded-lg p-1.5 ${
                      high
                        ? "border-amber-300 bg-amber-50"
                        : v != null
                          ? "border-gray-200 bg-white"
                          : "border-dashed border-gray-200 bg-gray-50"
                    }`}
                  >
                    <div className="flex items-baseline justify-between mb-1">
                      <span className={`text-xs font-medium ${
                        dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-gray-600"
                      }`}>
                        {Number(r.use_date.slice(8, 10))}
                      </span>
                      {mark && (
                        <span className="text-[10px] font-semibold text-gray-400">{mark}</span>
                      )}
                    </div>
                    <input
                      type="text" inputMode="decimal" placeholder="-"
                      className={`w-full min-w-0 border border-transparent hover:border-gray-300 focus:border-blue-400 rounded px-1 py-0.5 text-sm text-right bg-transparent placeholder:text-gray-300 focus:outline-none focus:bg-white ${
                        high ? "text-amber-700 font-semibold" : "text-gray-900"
                      }`}
                      defaultValue={v != null ? String(v) : ""}
                      onBlur={e => {
                        const cur = v != null ? String(v) : ""
                        if (e.target.value.trim() !== cur) saveDay(r.use_date, e.target.value)
                      }}
                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
                    />
                  </div>
                )
              })}
            </div>

            <p className="mt-2 text-xs text-gray-400">
              일평균의 1.5배를 넘는 날은 <span className="text-amber-700 bg-amber-50 border border-amber-300 rounded px-1">노란색</span>으로 표시됩니다.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 탭 3 — 요금표 관리
// ─────────────────────────────────────────────
type RateFormState = {
  id: number | null
  apply_start: string
  season: "S" | "O"
  tier1_limit: string
  tier2_limit: string
  base1: string
  base2: string
  base3: string
  rate1: string
  rate2: string
  rate3: string
  welfare_limit: string
  env_rate: string
  fuel_rate: string
  fund_rate: string
  vat_rate: string
  memo: string
}

/**
 * DB는 구간 **폭**(200/200)으로 저장하지만, 화면은 한전 요금표처럼
 * **누적 상한**(0~200 / 201~400)으로 보여준다. 저장할 때 폭으로 되돌린다.
 */
function rateToForm(r: PowerRateRow | null): RateFormState {
  return {
    id: r?.id ?? null,
    apply_start: r?.apply_start ?? todayISO(),
    season: (r?.season ?? "O") as "S" | "O",
    tier1_limit: String(r?.tier1_limit ?? 200),
    tier2_limit: String((r?.tier1_limit ?? 200) + (r?.tier2_limit ?? 200)),
    base1: String(r?.base1 ?? 730),
    base2: String(r?.base2 ?? 1260),
    base3: String(r?.base3 ?? 6060),
    rate1: String(r?.rate1 ?? 105),
    rate2: String(r?.rate2 ?? 174),
    rate3: String(r?.rate3 ?? 242.3),
    welfare_limit: String(r?.welfare_limit ?? 16000),
    env_rate: String(r?.env_rate ?? 9),
    fuel_rate: String(r?.fuel_rate ?? 5),
    fund_rate: String(r?.fund_rate ?? 2.7),
    vat_rate: String(r?.vat_rate ?? 10),
    memo: r?.memo ?? "",
  }
}

function RateModal({ initial, onClose, onSaved }: {
  initial: RateFormState
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof RateFormState, v: string) => setForm(f => ({ ...f, [k]: v }))
  const num = (v: string) => Number(v.replace(/,/g, "")) || 0

  async function save(e: React.SyntheticEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      // 화면은 누적 상한(0~200 / 201~400), DB는 구간 폭으로 저장
      const t1 = num(form.tier1_limit)
      const t2upper = num(form.tier2_limit)
      if (t2upper <= t1) throw new Error("2구간 상한은 1구간 상한보다 커야 합니다.")

      await upsertRate({
        id: form.id,
        apply_start: form.apply_start,
        season: form.season,
        tier1_limit: t1,
        tier2_limit: t2upper - t1,
        base1: num(form.base1), base2: num(form.base2), base3: num(form.base3),
        rate1: num(form.rate1), rate2: num(form.rate2), rate3: num(form.rate3),
        welfare_limit: num(form.welfare_limit),
        env_rate: num(form.env_rate), fuel_rate: num(form.fuel_rate),
        fund_rate: num(form.fund_rate), vat_rate: num(form.vat_rate),
        memo: form.memo || null,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했습니다.")
    }
    setSaving(false)
  }

  /** 표 안에서 쓰는 작은 숫자 입력 */
  const cell = (key: keyof RateFormState, suffix?: string) => (
    <div className="flex items-center gap-1">
      <input
        className="w-full min-w-0 border border-gray-300 rounded px-2 py-1 text-sm text-right text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        value={form[key] as string}
        onChange={e => set(key, e.target.value.replace(/[^0-9.]/g, ""))}
      />
      {suffix && <span className="text-[11px] text-gray-400 shrink-0">{suffix}</span>}
    </div>
  )

  const numField = (label: string, key: keyof RateFormState, suffix?: string) => (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</label>
      {cell(key, suffix)}
    </div>
  )

  const t1 = num(form.tier1_limit)
  const t2 = num(form.tier2_limit)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 sticky top-0">
          <h3 className="text-base font-bold text-gray-800">요금표 {form.id ? "수정" : "추가"}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <form onSubmit={save}>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">적용 시작일 <span className="text-red-400">*</span></label>
                <input required type="date" className={inputCls} value={form.apply_start} onChange={e => set("apply_start", e.target.value)} />
                <p className="text-[11px] text-gray-400 mt-1">검침일이 이 날짜 이후인 청구부터 적용</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">계절</label>
                <select className={inputCls} value={form.season} onChange={e => set("season", e.target.value)}>
                  <option value="O">기타계절 (01.01~06.30, 09.01~12.31)</option>
                  <option value="S">여름 (07.01~08.31)</option>
                </select>
                <p className="text-[11px] text-gray-400 mt-1">여름·기타계절 두 행이 한 쌍</p>
              </div>
            </div>

            {/* 누진 구간 — 한전 요금표와 같은 표 형태 */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">누진 구간별 요금</p>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid grid-cols-[64px_1fr_1fr_1fr] gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-600">
                  <div>구간</div>
                  <div>사용량 상한</div>
                  <div>기본요금</div>
                  <div>전력량 단가</div>
                </div>

                <div className="grid grid-cols-[64px_1fr_1fr_1fr] gap-2 px-3 py-2 items-center border-b border-gray-100">
                  <div className="text-xs font-medium text-gray-700">1구간</div>
                  <div>
                    {cell("tier1_limit", "kWh")}
                    <p className="text-[10px] text-gray-400 mt-0.5">0 ~ {fmt(t1)}</p>
                  </div>
                  {cell("base1", "원")}
                  {cell("rate1", "원")}
                </div>

                <div className="grid grid-cols-[64px_1fr_1fr_1fr] gap-2 px-3 py-2 items-center border-b border-gray-100">
                  <div className="text-xs font-medium text-gray-700">2구간</div>
                  <div>
                    {cell("tier2_limit", "kWh")}
                    <p className={`text-[10px] mt-0.5 ${t2 > t1 ? "text-gray-400" : "text-red-500"}`}>
                      {fmt(t1 + 1)} ~ {fmt(t2)}
                    </p>
                  </div>
                  {cell("base2", "원")}
                  {cell("rate2", "원")}
                </div>

                <div className="grid grid-cols-[64px_1fr_1fr_1fr] gap-2 px-3 py-2 items-center">
                  <div className="text-xs font-medium text-gray-700">3구간</div>
                  <div className="text-xs text-gray-400">{fmt(t2 + 1)} ~ 무제한</div>
                  {cell("base3", "원")}
                  {cell("rate3", "원")}
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                한전 기준 — 여름 300 / 450, 기타계절 200 / 400
              </p>
            </div>

            {/* 공통 단가 */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">공통 단가</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3">
                {numField("복지할인 한도", "welfare_limit", "원")}
                {numField("기후환경요금", "env_rate", "원/kWh")}
                {numField("연료비조정", "fuel_rate", "원/kWh")}
                {numField("전력기금률", "fund_rate", "%")}
                {numField("부가세율", "vat_rate", "%")}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">비고</label>
              <input className={inputCls} placeholder="예: 2026-01-22 인상" value={form.memo} onChange={e => set("memo", e.target.value)} />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RateTab({ rates, loading, onChanged }: {
  rates: PowerRateRow[]
  loading: boolean
  onChanged: () => void
}) {
  const [editing, setEditing] = useState<RateFormState | null>(null)

  async function handleDelete(r: PowerRateRow) {
    if (!confirm(`${r.apply_start} ${SEASON_LABEL[r.season]} 요금표를 삭제합니다.\n\n이 요금표로 계산되던 청구의 금액이 바뀝니다.`)) return
    await deleteRate(r.id)
    onChanged()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-700">요금표 관리</span>
        <button onClick={() => setEditing(rateToForm(null))} className="text-xs text-blue-600 border border-blue-300 rounded px-3 py-1 hover:bg-blue-50">
          + 요금표 추가
        </button>
      </div>

      <p className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
        사용기간 종료일 기준으로 <b>적용 시작일이 그보다 이르면서 가장 최근인</b> 요금표가 계절별로 하나씩 선택됩니다.
        인상 시 새 적용 시작일로 여름·기타계절 두 행을 추가하세요.
      </p>

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
      ) : rates.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">등록된 요금표가 없습니다</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-xs font-semibold text-gray-700">
                <th className="px-3 py-2 text-left">적용 시작일</th>
                <th className="px-3 py-2 text-left">계절</th>
                <th className="px-3 py-2 text-right">구간1/2</th>
                <th className="px-3 py-2 text-right">기본요금</th>
                <th className="px-3 py-2 text-right">단가</th>
                <th className="px-3 py-2 text-right">복지한도</th>
                <th className="px-3 py-2 text-right">환경/연료</th>
                <th className="px-3 py-2 text-right">기금/부가세</th>
                <th className="px-3 py-2 text-left">비고</th>
                <th className="px-3 py-2 text-center w-[110px]"></th>
              </tr>
            </thead>
            <tbody>
              {rates.map(r => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800 font-medium">{r.apply_start}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs font-medium ${r.season === "S" ? "text-red-600" : "text-blue-600"}`}>
                      {SEASON_LABEL[r.season]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{r.tier1_limit} / {r.tier2_limit}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmt(r.base1)} / {fmt(r.base2)} / {fmt(r.base3)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{r.rate1} / {r.rate2} / {r.rate3}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmt(r.welfare_limit)}</td>
                  <td className="px-3 py-2 text-right text-gray-500 text-xs">{r.env_rate} / {r.fuel_rate}</td>
                  <td className="px-3 py-2 text-right text-gray-500 text-xs">{r.fund_rate}% / {r.vat_rate}%</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.memo}</td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setEditing(rateToForm(r))} className="text-xs px-2 py-0.5 border text-gray-600 rounded hover:bg-gray-50">수정</button>
                      <button onClick={() => handleDelete(r)} className="text-xs px-2 py-0.5 border text-gray-500 border-gray-300 rounded hover:bg-red-50 hover:text-red-600 hover:border-red-300">삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <RateModal initial={editing} onClose={() => setEditing(null)} onSaved={onChanged} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────
export default function PowerPage() {
  const [tab, setTab] = useState<TabKey>("bill")
  const [bills, setBills] = useState<PowerBill[]>([])
  const [rates, setRates] = useState<PowerRateRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [b, r] = await Promise.all([getBills(), getRates()])
    setBills(b)
    setRates(r)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-lg font-bold text-gray-800">전기요금 관리</h1>
          <div className="flex items-center gap-1">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  tab === t.key
                    ? "bg-blue-600 text-white border-blue-600 font-medium"
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "bill"  && <BillTab bills={bills} loading={loading} onChanged={load} />}
        {tab === "daily" && <DailyTab bills={bills} onChanged={load} />}
        {tab === "rate"  && <RateTab rates={rates} loading={loading} onChanged={load} />}
      </div>
    </AppLayout>
  )
}
