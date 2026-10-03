"use client"

import { useCallback, useEffect, useState } from "react"
import { fmt, cc } from "@/lib/fmt"
import {
  previewAccumSnapshot, saveAccumSnapshot, getAccumBaseDates, getAccumConfig, searchStockList,
  type AccumBaseDate, type AccumConfig, type Account, type StockListItem,
} from "./actions"
import type { SnapshotPlan } from "@/lib/accum-snapshot"

const won = (n: number | null | undefined) => n == null ? "-" : `${fmt(n)}원`

// 금액 입력칸 — type="number" 로는 천단위 구분자를 못 보여줘 text 로 받고 숫자만 걸러 저장한다
const digits = (v: string) => v.replace(/[^0-9]/g, "")
const comma  = (v: string) => (v ? Number(v).toLocaleString("ko-KR") : "")

const todayISO = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
})()

type Form = { account_no: string; snap_date: string; qty: string; avg_price: string; balance: string
  stock_code: string; stock_name: string }

/**
 * 적립 — 주식모으기 관리.
 *
 * 매일 체결을 넣을 수 없어 **보유수량·평균매입가·계좌잔액** 세 값만 가끔 넣는다.
 * 평균 매입가가 총 매입원가를 품고 있어 구간 매입이 정확히 역산된다.
 */
export default function AccumPanel({ accounts }: { accounts: Account[] }) {
  const [form, setForm]       = useState<Form>({ account_no: "", snap_date: todayISO, qty: "", avg_price: "", balance: "", stock_code: "", stock_name: "" })
  const [stockQ, setStockQ]   = useState("")
  const [stockHits, setHits]  = useState<StockListItem[]>([])
  const [showDrop, setDrop]   = useState(false)
  const [plan, setPlan]       = useState<SnapshotPlan | null>(null)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState("")
  const [saved, setSaved]     = useState("")
  const [bases, setBases]     = useState<AccumBaseDate[]>([])
  const [cfg, setCfg]         = useState<AccumConfig | null>(null)

  const loadBases = useCallback(async () => { setBases(await getAccumBaseDates(12)) }, [])
  useEffect(() => {
    loadBases()
    getAccumConfig().then(c => {
      setCfg(c)
      // 기본 종목을 폼에 채운다 — 화면에서 다른 종목으로 바꿀 수 있다
      if (c.stock_code) setForm(f => f.stock_code ? f : { ...f, stock_code: c.stock_code, stock_name: c.stock_name ?? "" })
    })
  }, [loadBases])

  // 기본 계좌는 effect 로 state 를 채우지 않고 렌더 때 정한다
  const accountNo = form.account_no || accounts[0]?.account_no || ""

  const set = (k: keyof Form, v: string) => { setForm(f => ({ ...f, [k]: v })); setPlan(null); setSaved("") }

  function payload() {
    return {
      account_no: accountNo,
      snap_date:  form.snap_date,
      qty:        Number(form.qty),
      avg_price:  Number(form.avg_price),
      balance:    form.balance.trim() === "" ? null : Number(form.balance),
      stock_code: form.stock_code,
    }
  }

  async function run(kind: "preview" | "save") {
    setError(""); setSaved("")
    if (!accountNo)                        { setError("계좌를 선택하세요."); return }
    if (!form.stock_code)                  { setError("적립 종목을 선택하세요."); return }
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
      {/* 설정이 안 읽혔을 때만 뜬다 — 빈 화면으로 두면 원인을 알 수 없다 */}
      {cfg && (cfg.missing.length > 0 ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700">적립 설정이 비어 있습니다</p>
          <p className="text-xs text-red-600 mt-1">
            읽히지 않은 환경 변수: <b>{cfg.missing.join(", ")}</b>
          </p>
          <p className="text-xs text-gray-600 mt-2">
            <code className="bg-white px-1 rounded">config/.env</code> 에 값이 있어도
            <b> 서버 기동 시 한 번만 읽습니다</b> (<code className="bg-white px-1 rounded">next.config.ts</code> 의 dotenv).
            값을 추가·수정했다면 <b>dev 서버를 재시작</b>하세요. 배포본은 환경 변수 등록 후 <b>재배포</b>가 필요합니다.
          </p>
        </div>
      ) : null)}

      {/* ── 스냅샷 입력 ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">적립 스냅샷</h2>
        </div>

        <div className="p-4 space-y-3">
          {/* 1행 — 적립 종목(2칸) · 계좌 · 기준일 */}
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">적립 종목</label>
            {form.stock_code ? (
              <div className="flex items-center gap-2 px-3 py-2 border border-blue-300 bg-blue-50 rounded-lg">
                <span className="font-mono text-xs text-blue-700 font-semibold">{form.stock_code}</span>
                <span className="text-sm text-gray-800 flex-1">{form.stock_name}</span>
                <button type="button"
                  onClick={() => { setForm(f => ({ ...f, stock_code: "", stock_name: "" })); setPlan(null); setStockQ(""); setHits([]) }}
                  className="text-gray-500 hover:text-red-500 text-lg leading-none">×</button>
              </div>
            ) : (
              <div className="relative">
                <input type="text" value={stockQ} placeholder="종목명 또는 코드 검색..."
                  onChange={async (e) => {
                    setStockQ(e.target.value)
                    setHits(await searchStockList(e.target.value)); setDrop(true)
                  }}
                  onFocus={async () => { if (stockHits.length === 0) setHits(await searchStockList("")); setDrop(true) }}
                  onBlur={() => setTimeout(() => setDrop(false), 150)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {showDrop && stockHits.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto w-full min-w-[26rem]">
                    {stockHits.map(it => (
                      <button key={it.code} type="button"
                        onMouseDown={() => { setForm(f => ({ ...f, stock_code: it.code, stock_name: it.name })); setPlan(null); setDrop(false) }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50">
                        <span className="font-mono text-xs text-blue-600 font-semibold w-16 shrink-0">{it.code}</span>
                        <span className="text-sm text-gray-900 flex-1 truncate">{it.name}</span>
                        <span className="text-xs text-gray-500 shrink-0">{it.market}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">계좌</label>
              <select
                value={accountNo}
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
          </div>

          {/* 2행 — 보유수량 · 평균 매입가 · 계좌 잔액 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">보유 수량 (주)</label>
              <input type="number" placeholder="20" value={form.qty} onChange={(e) => set("qty", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {/* 금액은 천단위 구분자를 보여준다 — type=number 로는 안 되므로 text + 숫자만 걸러 저장 */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">평균 매입가 (원)</label>
              <input type="text" inputMode="numeric" placeholder="17,350"
                value={comma(form.avg_price)}
                onChange={(e) => set("avg_price", digits(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">계좌 잔액 (원)</label>
              <input type="text" inputMode="numeric" placeholder="975,371"
                value={comma(form.balance)}
                onChange={(e) => set("balance", digits(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="flex gap-2">
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

          {error && <p className="text-xs text-red-500">{error}</p>}

          {/* ── 미리보기 ── */}
          {plan && (
            <div className={`rounded-lg border p-3 space-y-2 ${blocked ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"}`}>
              {blocked ? (
                plan.errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-gray-500">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-1.5">생성될 내역</th>
                      <th className="text-right">구분</th>
                      <th className="text-right">수량</th>
                      <th className="text-right">단가</th>
                      <th className="text-right">금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {plan.buys.map((b, i) => (
                      <tr key={i}>
                        <td className="py-1.5 text-gray-700">
                          {b.s_date.slice(0,4)}-{b.s_date.slice(4,6)}-{b.s_date.slice(6,8)}
                          {b.is_base_day && <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">기산일</span>}
                          {plan.split_basis === "weekday" && plan.buys.length > 1 && i === 0 && (
                            <span className="ml-1.5 text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-medium">추정</span>
                          )}
                        </td>
                        <td className="text-right text-gray-600">{b.fund_type === 2 ? "분배금" : "현금"}</td>
                        <td className="text-right text-gray-900">{fmt(b.qty)}주</td>
                        <td className="text-right text-gray-700">{fmt(Math.round(b.s_amt))}</td>
                        <td className="text-right text-gray-700">{fmt(Math.round(b.qty * b.s_amt))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-300">
                    <tr>
                      <td className="py-1.5 font-semibold text-gray-700">합계</td>
                      <td />
                      <td className="text-right font-semibold text-gray-900">{fmt(plan.add_qty)}주</td>
                      <td className="text-right font-semibold text-gray-700">{fmt(Math.round(plan.unit_price))}</td>
                      <td className="text-right font-semibold text-gray-900">{fmt(plan.add_cost)}</td>
                    </tr>
                    {plan.balance_gap != null && plan.balance_gap !== 0 && (
                      <tr>
                        <td className="py-1.5 text-gray-700">잔액 조정</td>
                        <td colSpan={3} />
                        <td className={`text-right font-semibold ${cc(plan.balance_gap)}`}>
                          {plan.balance_gap > 0 ? "+" : ""}{fmt(plan.balance_gap)}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 기산일 정리 ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">분배금 기산일</h2>
        </div>
        {bases.length === 0 ? (
          <p className="text-center text-gray-500 py-8 text-sm">
            {cfg && cfg.missing.length > 0
              ? "적립 설정이 비어 있어 기산일을 계산할 수 없습니다 (위 안내 참고)."
              : "분배금 이력이 없습니다."}
          </p>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {["분배 종목", "지급기준일", "기산일", "실지급일", "주당 분배금", "기산일 보유수량", "스냅샷"].map((h, i) => (
                    <th key={i} className={`px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap ${i < 4 ? "text-left" : i === 6 ? "text-center" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bases.map(b => (
                  <tr key={b.ref_date} className={b.passed ? "hover:bg-gray-50" : "bg-blue-50/40"}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-mono text-xs text-gray-500">{b.div_code}</span>
                      <span className="ml-1.5 text-xs text-gray-700">{b.div_name ?? ""}</span>
                    </td>
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
