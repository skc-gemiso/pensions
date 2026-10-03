"use client"

import { useCallback, useEffect, useState } from "react"
import { fmt, cc } from "@/lib/fmt"
import {
  previewAccumSnapshot, saveAccumSnapshot, getAccumBaseDates,
  type AccumBaseDate, type Account,
} from "./actions"
import type { SnapshotPlan } from "@/lib/accum-snapshot"

const won = (n: number | null | undefined) => n == null ? "-" : `${fmt(n)}원`

const todayISO = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
})()

type Form = { account_no: string; snap_date: string; qty: string; avg_price: string; balance: string }

/**
 * 적립 — 주식모으기 관리.
 *
 * 매일 체결을 넣을 수 없어 **보유수량·평균매입가·계좌잔액** 세 값만 가끔 넣는다.
 * 평균 매입가가 총 매입원가를 품고 있어 구간 매입이 정확히 역산된다.
 */
export default function AccumPanel({ accounts }: { accounts: Account[] }) {
  const [form, setForm]       = useState<Form>({ account_no: "", snap_date: todayISO, qty: "", avg_price: "", balance: "" })
  const [plan, setPlan]       = useState<SnapshotPlan | null>(null)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState("")
  const [saved, setSaved]     = useState("")
  const [bases, setBases]     = useState<AccumBaseDate[]>([])

  const loadBases = useCallback(async () => { setBases(await getAccumBaseDates(12)) }, [])
  useEffect(() => { loadBases() }, [loadBases])

  useEffect(() => {
    if (!form.account_no && accounts.length > 0) setForm(f => ({ ...f, account_no: accounts[0].account_no }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length])

  const set = (k: keyof Form, v: string) => { setForm(f => ({ ...f, [k]: v })); setPlan(null); setSaved("") }

  function payload() {
    return {
      account_no: form.account_no,
      snap_date:  form.snap_date,
      qty:        Number(form.qty),
      avg_price:  Number(form.avg_price),
      balance:    form.balance.trim() === "" ? null : Number(form.balance),
    }
  }

  async function run(kind: "preview" | "save") {
    setError(""); setSaved("")
    if (!form.account_no)                  { setError("계좌를 선택하세요."); return }
    if (!form.qty || Number(form.qty) < 0) { setError("보유 수량을 입력하세요."); return }
    if (!form.avg_price)                   { setError("평균 매입가를 입력하세요."); return }
    setBusy(true)
    try {
      const p = kind === "preview" ? await previewAccumSnapshot(payload()) : await saveAccumSnapshot(payload())
      setPlan(p)
      if (kind === "save") {
        setSaved(`매입 ${p.buys.length}건 저장${p.balance_gap ? ` · 잔액 조정 ${won(p.balance_gap)}` : ""}`)
        await loadBases()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리 실패")
    } finally {
      setBusy(false)
    }
  }

  const blocked = (plan?.errors.length ?? 0) > 0

  return (
    <div className="space-y-5">
      {/* ── 스냅샷 입력 ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">적립 스냅샷</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            증권사 화면의 <b>보유 수량 · 평균 매입가 · 계좌 잔액</b>을 넣으면 직전 상태와 비교해
            구간 매입을 역산합니다. 매일 체결을 넣을 필요가 없습니다.
          </p>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-5 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">계좌</label>
              <select
                value={form.account_no}
                onChange={(e) => set("account_no", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {accounts.map(a => (
                  <option key={a.account_no} value={a.account_no}>{a.account_no} ({a.account_nm})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">기준일</label>
              <input type="date" value={form.snap_date} onChange={(e) => set("snap_date", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">보유 수량 (주)</label>
              <input type="number" placeholder="20" value={form.qty} onChange={(e) => set("qty", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">평균 매입가 (원)</label>
              <input type="number" placeholder="17350" value={form.avg_price} onChange={(e) => set("avg_price", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-5 gap-3 items-end">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                계좌 잔액 (원) <span className="font-normal text-gray-400">— 넣으면 모르는 입출금을 자동 보정</span>
              </label>
              <input type="number" placeholder="비우면 보정 안 함" value={form.balance} onChange={(e) => set("balance", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-3 flex gap-2">
              <button onClick={() => run("preview")} disabled={busy}
                className="px-4 py-2 border border-blue-400 text-blue-600 text-sm rounded-lg hover:bg-blue-50 disabled:opacity-50">
                {busy ? "계산 중..." : "미리보기"}
              </button>
              <button onClick={() => run("save")} disabled={busy || !plan || blocked}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40">
                저장
              </button>
              {saved && <span className="self-center text-xs text-green-700 font-medium">{saved}</span>}
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          {/* ── 미리보기 ── */}
          {plan && (
            <div className={`rounded-lg border p-3 space-y-2 ${blocked ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"}`}>
              {blocked ? (
                plan.errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-3 text-xs">
                    <div><span className="text-gray-500">직전 보유</span><br/><b className="text-gray-900">{fmt(plan.prev_qty)}주 · {won(plan.prev_cost)}</b></div>
                    <div><span className="text-gray-500">구간 매입</span><br/><b className="text-blue-700">+{fmt(plan.add_qty)}주 · {won(plan.add_cost)}</b></div>
                    <div><span className="text-gray-500">구간 단가</span><br/><b className="text-gray-900">{won(Math.round(plan.unit_price))}</b></div>
                    <div><span className="text-gray-500">기산일 분할</span><br/><b className="text-gray-900">{plan.base_date ?? "없음"}</b></div>
                  </div>

                  <table className="w-full text-xs mt-1">
                    <thead className="text-gray-500">
                      <tr><th className="text-left py-1">생성될 매입</th><th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">금액</th><th className="text-right">자금</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {plan.buys.map((b, i) => (
                        <tr key={i}>
                          <td className="py-1 text-gray-700">
                            {b.s_date.slice(0,4)}-{b.s_date.slice(4,6)}-{b.s_date.slice(6,8)}
                            {b.is_base_day && <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">기산일</span>}
                          </td>
                          <td className="text-right text-gray-900">{fmt(b.qty)}주</td>
                          <td className="text-right text-gray-700">{won(Math.round(b.s_amt))}</td>
                          <td className="text-right text-gray-700">{won(Math.round(b.qty * b.s_amt))}</td>
                          <td className="text-right text-gray-600">{b.fund_type === 2 ? "분배금" : "현금"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <p className="text-[11px] text-gray-500">
                    자금 구분 근거 — 구간 입금 분배금 {won(plan.inflow_div)} · 현금 {won(plan.inflow_cash)}
                    {plan.inflow_div + plan.inflow_cash === 0 && " (입금 기록이 없어 전액 분배금으로 봅니다)"}
                  </p>

                  {plan.balance_gap != null && (
                    <p className="text-xs">
                      <span className="text-gray-500">잔액 검증</span>{" "}
                      예상 {won(plan.expected_balance)} vs 실제 {won(plan.actual_balance)} →{" "}
                      <b className={cc(plan.balance_gap)}>
                        {plan.balance_gap === 0 ? "일치" : `조정 ${plan.balance_gap > 0 ? "+" : ""}${fmt(plan.balance_gap)}원`}
                      </b>
                      {plan.balance_gap !== 0 && <span className="text-gray-400"> — 기록에 없는 입출금을 한 줄로 흡수합니다</span>}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 기산일 정리 ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">분배금 기산일</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            분배금 대상 수량은 <b>기산일 하루</b>만 봅니다. 그 날 스냅샷이 있으면 분배금 수량이 정확하고,
            없으면 구간을 쪼개 추정합니다.
          </p>
        </div>
        {bases.length === 0 ? (
          <p className="text-center text-gray-500 py-8 text-sm">분배금 이력이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {["지급기준일", "기산일", "실지급일", "주당 분배금", "기산일 보유수량", "스냅샷"].map((h, i) => (
                    <th key={i} className={`px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap ${i < 3 ? "text-left" : i === 5 ? "text-center" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bases.map(b => (
                  <tr key={b.ref_date} className={b.passed ? "hover:bg-gray-50" : "bg-blue-50/40"}>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{b.ref_date}</td>
                    <td className="px-3 py-2 text-gray-900 font-medium whitespace-nowrap">
                      {b.base_date}
                      {!b.passed && <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">예정</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{b.pay_date ?? "-"}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{won(b.dist_amt)}</td>
                    <td className="px-3 py-2 text-right text-gray-900">{fmt(b.qty_at_base)}주</td>
                    <td className="px-3 py-2 text-center">
                      {b.has_snapshot
                        ? <span className="text-xs text-green-700 font-medium">있음</span>
                        : <span className="text-xs text-gray-400">{b.passed ? "없음 (추정)" : "—"}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
