"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import AppLayout from "@/components/AppLayout"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts"
import { fmt, cc } from "@/lib/fmt"

const won = (n: number | null | undefined) => n == null ? "-" : `${fmt(n)}원`
import {
  getHoldings, getTransactions, addTransaction, deleteTransaction,
  getDailyPrices, fetchAndSaveNaverPrices, searchStockList, getMarketIndices, getDefaultStockList,
  type StockHolding, type StockTransaction, type DailyPrice, type StockListItem, type MarketIndex,
} from "./actions"

type StockSearchItem = StockListItem

type FormState = {
  cnt: "1" | "2"
  stock_type: "1" | "2"
  stock_code: string
  stock_name: string
  s_date: string   // YYYY-MM-DD (input[type=date] 형식)
  qty: string
  s_amt: string
}

const today    = new Date()
const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

const EMPTY_FORM: FormState = {
  cnt: "1",
  stock_type: "1",
  stock_code: "",
  stock_name: "",
  s_date: todayISO,
  qty: "",
  s_amt: "",
}

const CHART_PERIODS = [
  { label: "1개월", days: 30 },
  { label: "3개월", days: 90 },
  { label: "6개월", days: 180 },
  { label: "1년",   days: 365 },
  { label: "전체",  days: 9999 },
]

function fmtDate(s: string) {
  // YYYYMMDD → YYYY-MM-DD
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

export default function StockPage() {
  const [holdings, setHoldings]           = useState<StockHolding[]>([])
  const [selectedCode, setSelectedCode]   = useState<string | null>(null)
  const [marketIndices, setMarketIndices] = useState<{ kospi: MarketIndex | null; kosdaq: MarketIndex | null }>({ kospi: null, kosdaq: null })
  const [dailyPrices, setDailyPrices]     = useState<DailyPrice[]>([])
  const [chartLoading, setChartLoading]   = useState(false)
  const [chartDays, setChartDays]         = useState(365)
  const [fetchingNaver, setFetchingNaver] = useState(false)
  const [transactions, setTransactions]   = useState<StockTransaction[]>([])
  const [txLoading, setTxLoading]         = useState(false)
  const [tooltip, setTooltip]             = useState<{ code: string; x: number; y: number } | null>(null)
  const [showModal, setShowModal]         = useState(false)
  const [form, setForm]                   = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting]       = useState(false)
  const [formError, setFormError]         = useState("")
  const [activeTab, setActiveTab]         = useState<"portfolio" | "history">("portfolio")
  // 종목 검색
  const [stockSearch, setStockSearch]     = useState("")
  const [stockResults, setStockResults]   = useState<StockSearchItem[]>([])
  const [showStockDrop, setShowStockDrop] = useState(false)
  const blurTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadHoldings = useCallback(async () => {
    const h = await getHoldings()
    setHoldings(h)
    return h
  }, [])

  const loadDailyPrices = useCallback(async (code: string) => {
    setChartLoading(true)
    const prices = await getDailyPrices(code)
    setDailyPrices(prices)
    setChartLoading(false)
  }, [])

  const loadTransactions = useCallback(async () => {
    setTxLoading(true)
    const tx = await getTransactions()
    setTransactions(tx)
    setTxLoading(false)
  }, [])

  const loadMarketIndices = useCallback(async () => {
    const data = await getMarketIndices()
    setMarketIndices(data)
  }, [])

  useEffect(() => {
    loadMarketIndices()
    loadHoldings().then((h) => {
      if (h.length > 0) {
        const firstCode = h[0].stock_code
        setSelectedCode(firstCode)
        // 페이지 진입 시 자동 최신화 (silent — alert 없음)
        handleFetchNaver(firstCode, true)
      }
    })
    loadTransactions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadHoldings, loadTransactions, loadMarketIndices])

  useEffect(() => {
    if (selectedCode) loadDailyPrices(selectedCode)
    else setDailyPrices([])
  }, [selectedCode, loadDailyPrices])

  // t_stock_list default_yn='Y' 기준 전체 수집
  // codeToLoad: daily prices 로드할 종목코드 (state의 selectedCode 대신)
  // silent: true면 완료 alert 생략
  async function handleFetchNaver(codeToLoad?: string | null, silent = false) {
    setFetchingNaver(true)
    try {
      const defaultStocks = await getDefaultStockList()
      let total = 0
      for (const s of defaultStocks) {
        try { total += await fetchAndSaveNaverPrices(s.stock_code, s.stock_type) }
        catch { /* 개별 실패 무시 */ }
      }
      await loadHoldings()
      const code = codeToLoad !== undefined ? codeToLoad : selectedCode
      if (code) await loadDailyPrices(code)
      await loadMarketIndices()
      if (!silent) alert(`${defaultStocks.length}개 종목 최신화 완료 (${total}건 저장)`)
    } catch (e) {
      if (!silent) alert(`오류: ${e instanceof Error ? e.message : "알 수 없는 오류"}`)
    } finally {
      setFetchingNaver(false)
    }
  }

  function handleStockSearch(value: string) {
    setStockSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      const data = await searchStockList(value)
      setStockResults(data)
      setShowStockDrop(true)
    }, 200)
  }

  function selectStock(item: StockSearchItem) {
    setForm((f) => ({ ...f, stock_code: item.code, stock_name: item.name }))
    setStockSearch("")
    setStockResults([])
    setShowStockDrop(false)
  }

  function clearStock() {
    setForm((f) => ({ ...f, stock_code: "", stock_name: "" }))
    setStockSearch("")
    setStockResults([])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError("")
    if (!form.stock_code.trim()) { setFormError("종목을 선택하세요."); return }
    if (!form.s_date) { setFormError("일자를 선택하세요."); return }
    const qty  = Number(form.qty)
    const sAmt = Number(form.s_amt)
    if (!qty || qty === 0)    { setFormError("수량을 입력하세요. (매입: 양수, 매도: 음수)"); return }
    if (!sAmt || sAmt <= 0)   { setFormError("단가를 올바르게 입력하세요."); return }
    const cnt = qty > 0 ? 1 : 2   // qty 부호로 매입/매도 자동 결정

    setSubmitting(true)
    try {
      await addTransaction({
        stock_code: form.stock_code.trim().toUpperCase(),
        s_date: form.s_date.replace(/-/g, ""),   // YYYY-MM-DD → YYYYMMDD
        cnt,
        stock_type: Number(form.stock_type),
        qty,
        s_amt: sAmt,
      })
      setShowModal(false)
      setForm(EMPTY_FORM)
      await loadHoldings()
      loadTransactions()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "저장 실패")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("이 거래 내역을 삭제하시겠습니까?")) return
    await deleteTransaction(id)
    await loadHoldings()
    loadTransactions()
  }

  // Chart data filtered by period
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - chartDays)
  const chartData = dailyPrices
    .filter((p) => chartDays === 9999 || new Date(p.s_date) >= cutoff)
    .map((p) => ({ date: p.s_date, amt: p.amt, c_amt: p.c_amt, e_rate: p.e_rate, e_trade: p.e_trade }))
  const chartAvg = chartData.length > 0
    ? chartData.reduce((s, r) => s + r.amt, 0) / chartData.length
    : null

  // t_stock_amt 최신 저장가 기반 포트폴리오 계산 (평가금액 큰 순 정렬)
  const portfolioRows = holdings
    .map((h) => {
      const curPrice        = h.latest_price
      const evalAmt         = curPrice != null ? Math.round(curPrice * h.net_qty) : null
      const pnl             = evalAmt != null ? evalAmt - h.total_buy_amount : null
      const pnlRate         = (pnl != null && h.total_buy_amount > 0)
        ? (pnl / h.total_buy_amount) * 100 : null
      const priceChange     = (curPrice != null && h.prev_price != null)
        ? curPrice - h.prev_price : null
      const priceChangeRate = (priceChange != null && h.prev_price != null && h.prev_price > 0)
        ? (priceChange / h.prev_price) * 100 : null
      return { ...h, curPrice, evalAmt, pnl, pnlRate, priceChange, priceChangeRate }
    })
    .sort((a, b) => (b.evalAmt ?? -1) - (a.evalAmt ?? -1))

  // 종목별 매입 내역 맵 (호버 툴팁용)
  const txMap = useMemo(() => {
    const map: Record<string, StockTransaction[]> = {}
    for (const tx of transactions) {
      if (tx.qty <= 0) continue   // 매입(양수)만
      if (!map[tx.stock_code]) map[tx.stock_code] = []
      map[tx.stock_code].push(tx)
    }
    // 각 종목별로 날짜 역순 정렬
    for (const code of Object.keys(map)) {
      map[code].sort((a, b) => b.s_date.localeCompare(a.s_date))
    }
    return map
  }, [transactions])

  const totalBuy   = portfolioRows.reduce((s, r) => s + r.total_buy_amount, 0)
  const totalEval  = portfolioRows.reduce((s, r) => s + (r.evalAmt ?? 0), 0)
  const totalPnl   = totalEval - totalBuy
  const totalRate  = totalBuy > 0 ? (totalPnl / totalBuy) * 100 : null

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-5">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">주식 투자</h1>
            <p className="text-xs text-gray-500 mt-0.5">실시간 평가 현황 및 거래 내역 관리</p>
          </div>
          <button
            onClick={() => { setForm(EMPTY_FORM); setFormError(""); setStockSearch(""); setStockResults([]); setShowModal(true) }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 매입/매도 내역 추가
          </button>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 border-b border-gray-200">
          {(["portfolio", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "portfolio" ? "포트폴리오" : "거래 내역"}
            </button>
          ))}
        </div>

        {/* ── 포트폴리오 탭 ── */}
        {activeTab === "portfolio" && (
          <>
            {/* 요약 카드 */}
            {portfolioRows.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs font-medium text-gray-600">총 매입금액</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">{won(totalBuy)}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs font-medium text-gray-600">총 평가금액</p>
                  <p className={`text-lg font-bold mt-1 ${cc(totalEval - totalBuy)}`}>
                    {won(totalEval)}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs font-medium text-gray-600">총 평가손익 / 수익률</p>
                  <p className={`text-lg font-bold mt-1 ${cc(totalPnl)}`}>
                    {totalPnl > 0 ? "+" : ""}{won(totalPnl)}
                    {totalRate != null && (
                      <span className="text-sm ml-1">
                        ({totalRate > 0 ? "+" : ""}{fmt(totalRate, 2)}%)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* 포트폴리오 테이블 */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">
                    보유 종목
                    {(marketIndices.kospi || marketIndices.kosdaq) && (
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        {marketIndices.kospi && (
                          <>
                            코스피 : <span className="text-gray-800 font-medium">{fmt(marketIndices.kospi.price, 2)}</span>
                            <span className={`ml-1 ${cc(marketIndices.kospi.changeRate)}`}>
                              {marketIndices.kospi.changeRate > 0 ? "+" : ""}{fmt(marketIndices.kospi.changeRate, 2)}%
                            </span>
                          </>
                        )}
                        {marketIndices.kospi && marketIndices.kosdaq && <span className="mx-2">·</span>}
                        {marketIndices.kosdaq && (
                          <>
                            코스닥 : <span className="text-gray-800 font-medium">{fmt(marketIndices.kosdaq.price, 2)}</span>
                            <span className={`ml-1 ${cc(marketIndices.kosdaq.changeRate)}`}>
                              {marketIndices.kosdaq.changeRate > 0 ? "+" : ""}{fmt(marketIndices.kosdaq.changeRate, 2)}%
                            </span>
                          </>
                        )}
                      </span>
                    )}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleFetchNaver()}
                    disabled={fetchingNaver || holdings.length === 0}
                    className="text-xs px-3 py-1.5 border border-blue-400 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50 whitespace-nowrap"
                  >
                    {fetchingNaver ? "가져오는 중..." : "네이버 주가 가져오기"}
                  </button>
                  {selectedCode && (
                    <a
                      href={`https://finance.naver.com/item/sise.naver?code=${selectedCode}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 whitespace-nowrap"
                    >
                      네이버 금융 →
                    </a>
                  )}
                </div>
              </div>
              {portfolioRows.length === 0 ? (
                <p className="text-center text-gray-400 py-10 text-sm">보유 종목이 없습니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {["종목코드", "종목명", "구분", "잔고", "평균매입가", "현재가", "매입금액", "평가금액", "평가손익", "수익률"].map((h) => (
                          <th
                            key={h}
                            className={`px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap ${
                              h === "종목코드" || h === "종목명" || h === "구분" ? "text-left" : "text-right"
                            }`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {portfolioRows.map((r) => (
                        <tr
                          key={r.stock_code}
                          onClick={() => setSelectedCode(selectedCode === r.stock_code ? null : r.stock_code)}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setTooltip({
                              code: r.stock_code,
                              x: Math.min(rect.left, window.innerWidth - 420),
                              y: rect.bottom + 4,
                            })
                          }}
                          onMouseLeave={() => setTooltip(null)}
                          className={`cursor-pointer transition-colors ${
                            selectedCode === r.stock_code ? "bg-blue-50" : "hover:bg-gray-50"
                          }`}
                        >
                          <td className="px-3 py-2 font-mono text-xs text-gray-700">{r.stock_code}</td>
                          <td className="px-3 py-2 text-gray-900 font-medium whitespace-nowrap">
                            {r.stock_name ?? r.stock_code}
                          </td>
                          <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
                            {r.stock_type === 2 ? "ETF" : "주식"}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmt(r.net_qty)}주</td>
                          <td className="px-3 py-2 text-right text-gray-700">{fmt(r.avg_buy_price)}원</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">
                            {r.curPrice != null ? `${fmt(r.curPrice)}원` : "-"}
                            {r.priceChange != null && (
                              <div className={`text-xs ${cc(r.priceChange)}`}>
                                {r.priceChange > 0 ? "+" : ""}{fmt(r.priceChange)}원
                                {r.priceChangeRate != null && (
                                  <span className="ml-1">({r.priceChangeRate > 0 ? "+" : ""}{fmt(r.priceChangeRate, 2)}%)</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700">{won(r.total_buy_amount)}</td>
                          <td className={`px-3 py-2 text-right font-medium ${cc(r.pnl)}`}>
                            {r.evalAmt != null ? won(r.evalAmt) : "-"}
                          </td>
                          <td className={`px-3 py-2 text-right font-medium ${cc(r.pnl)}`}>
                            {r.pnl != null ? `${r.pnl > 0 ? "+" : ""}${won(r.pnl)}` : "-"}
                          </td>
                          <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${cc(r.pnlRate)}`}>
                            {r.pnlRate != null ? `${r.pnlRate > 0 ? "+" : ""}${fmt(r.pnlRate, 2)}%` : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 차트 패널 */}
            {selectedCode && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
                <h2 className="text-sm font-semibold text-gray-800">
                  {holdings.find(h => h.stock_code === selectedCode)?.stock_name ?? selectedCode} 일별 주가
                </h2>

                {/* 기간 선택 */}
                <div className="flex gap-1">
                  {CHART_PERIODS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setChartDays(p.days)}
                      className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                        chartDays === p.days
                          ? "bg-blue-600 text-white border-blue-600"
                          : "border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {chartLoading && <p className="text-center text-gray-400 py-8 text-sm">로딩 중...</p>}

                {!chartLoading && chartData.length === 0 && (
                  <p className="text-center text-gray-400 py-8 text-sm">
                    저장된 주가 데이터가 없습니다. 위 "네이버 주가 가져오기" 버튼을 눌러 데이터를 불러오세요.
                  </p>
                )}

                {!chartLoading && chartData.length > 0 && (
                  <>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={chartData} margin={{ top: 5, right: 14, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: "#374151" }}
                          tickFormatter={(v) => String(v).slice(0, 7)}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#374151" }}
                          tickFormatter={(v) => Number(v).toLocaleString()}
                          domain={["auto", "auto"]}
                          width={72}
                        />
                        <Tooltip
                          formatter={(v: unknown) => [`${fmt(Number(v))} 원`, "종가"]}
                          labelFormatter={(l) => String(l)}
                          contentStyle={{ fontSize: 12, padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6 }}
                          labelStyle={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 2 }}
                          itemStyle={{ fontSize: 12, padding: "1px 0" }}
                        />
                        {chartAvg != null && (
                          <ReferenceLine
                            y={chartAvg}
                            stroke="#9ca3af"
                            strokeDasharray="4 2"
                            label={{ value: `평균 ${fmt(chartAvg)}`, position: "insideTopRight", fontSize: 9, fill: "#9ca3af" }}
                          />
                        )}
                        <Line type="monotone" dataKey="amt" stroke="#2563eb" dot={false} strokeWidth={2} name="종가" />
                      </LineChart>
                    </ResponsiveContainer>

                    {/* 일자별 주가 테이블 */}
                    <div className="border border-gray-100 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              {["날짜", "종가", "전일 대비", "등락률", "거래량"].map((h) => (
                                <th
                                  key={h}
                                  className={`px-3 py-2 text-xs font-semibold text-gray-700 ${h === "날짜" ? "text-left" : "text-right"}`}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {[...chartData].reverse().map((row, i, arr) => {
                              // 저장된 값 우선, 없으면 연속행 계산
                              const change     = row.c_amt   ?? (arr[i + 1] ? row.amt - arr[i + 1].amt : null)
                              const changeRate = row.e_rate  ?? ((change != null && arr[i + 1]) ? (change / arr[i + 1].amt) * 100 : null)
                              const volume     = row.e_trade ?? null
                              return (
                                <tr key={row.date} className="hover:bg-gray-50">
                                  <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{row.date}</td>
                                  <td className="px-3 py-1.5 text-right font-medium text-gray-900">{fmt(row.amt)}원</td>
                                  <td className={`px-3 py-1.5 text-right font-medium ${cc(change)}`}>
                                    {change != null ? `${change > 0 ? "+" : ""}${fmt(change)}` : "-"}
                                  </td>
                                  <td className={`px-3 py-1.5 text-right font-medium ${cc(changeRate)}`}>
                                    {changeRate != null ? `${changeRate > 0 ? "+" : ""}${fmt(changeRate, 2)}%` : "-"}
                                  </td>
                                  <td className="px-3 py-1.5 text-right text-gray-600">
                                    {volume != null ? fmt(volume) : "-"}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ── 거래 내역 탭 ── */}
        {activeTab === "history" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800">전체 거래 내역</h2>
            </div>
            {txLoading ? (
              <p className="text-center text-gray-400 py-8 text-sm">로딩 중...</p>
            ) : transactions.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">거래 내역이 없습니다.</p>
            ) : (
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {["일자", "종목코드", "종목명", "구분", "수량", "단가", "금액", ""].map((h, i) => (
                        <th
                          key={i}
                          className={`px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap ${
                            i < 3 ? "text-left" : "text-right"
                          } ${i === 7 ? "text-center" : ""}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(tx.s_date)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-700">{tx.stock_code}</td>
                        <td className="px-3 py-2 text-gray-900 whitespace-nowrap">
                          {holdings.find(h => h.stock_code === tx.stock_code)?.stock_name ?? tx.stock_code}
                        </td>
                        <td className={`px-3 py-2 text-right font-medium ${tx.qty > 0 ? "text-red-600" : "text-blue-600"}`}>
                          {tx.qty > 0 ? "매입" : "매도"}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-900">{fmt(tx.qty)}주</td>
                        <td className="px-3 py-2 text-right text-gray-700">{fmt(tx.s_amt)}원</td>
                        <td className="px-3 py-2 text-right text-gray-700">{won(tx.qty * tx.s_amt)}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => handleDelete(tx.id)}
                            className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── 보유 종목 호버 툴팁 ── */}
        {tooltip && (() => {
          const holding  = holdings.find(h => h.stock_code === tooltip.code)
          const curPrice = holding?.latest_price ?? null
          const buyTxs   = txMap[tooltip.code] ?? []
          return (
            <div
              className="fixed z-40 bg-white border border-gray-200 rounded-xl shadow-2xl p-4 w-[400px] pointer-events-none"
              style={{ top: tooltip.y, left: tooltip.x }}
            >
              <p className="text-xs font-semibold text-gray-700 mb-2">
                {holding?.stock_name ?? tooltip.code} 매입 내역
              </p>
              {buyTxs.length === 0 ? (
                <p className="text-xs text-gray-400">매입 내역 없음</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-100">
                      <th className="text-left pb-1">매입일</th>
                      <th className="text-right pb-1">수량</th>
                      <th className="text-right pb-1">매입가</th>
                      <th className="text-right pb-1">현재가</th>
                      <th className="text-right pb-1">수익률</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {buyTxs.map(tx => {
                      const rate = (curPrice != null && tx.s_amt > 0)
                        ? (curPrice - tx.s_amt) / tx.s_amt * 100 : null
                      return (
                        <tr key={tx.id} className="leading-6">
                          <td className="text-gray-700 pr-2">{`${tx.s_date.slice(0,4)}-${tx.s_date.slice(4,6)}-${tx.s_date.slice(6,8)}`}</td>
                          <td className="text-right text-gray-700">{fmt(tx.qty)}주</td>
                          <td className="text-right text-gray-700">{fmt(tx.s_amt)}원</td>
                          <td className="text-right text-gray-700">{curPrice != null ? `${fmt(curPrice)}원` : "-"}</td>
                          <td className={`text-right font-semibold ${cc(rate)}`}>
                            {rate != null ? `${rate > 0 ? "+" : ""}${fmt(rate, 2)}%` : "-"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )
        })()}

        {/* ── 매입/매도 추가 모달 ── */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">매입/매도 내역 추가</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
              <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

                {/* 구분 안내 */}
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500">
                  수량 <span className="font-semibold text-red-600">양수(+)</span> = 매입 &nbsp;·&nbsp;
                  수량 <span className="font-semibold text-blue-600">음수(-)</span> = 매도
                </div>

                {/* 종목 구분 */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">종목 유형</label>
                  <div className="flex gap-2">
                    {(["1", "2"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, stock_type: v }))}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                          form.stock_type === v
                            ? "bg-blue-600 text-white border-blue-600"
                            : "border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {v === "1" ? "주식" : "ETF"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 일자 */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">일자</label>
                  <input
                    type="date"
                    value={form.s_date}
                    onChange={(e) => setForm((f) => ({ ...f, s_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* 종목 검색 */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">종목</label>

                  {/* 선택된 종목 칩 */}
                  {form.stock_code ? (
                    <div className="flex items-center gap-2 px-3 py-2 border border-blue-300 bg-blue-50 rounded-lg">
                      <span className="font-mono text-xs text-blue-700 font-semibold">{form.stock_code}</span>
                      <span className="text-sm text-gray-800 flex-1">{form.stock_name}</span>
                      <button
                        type="button"
                        onClick={clearStock}
                        className="text-gray-400 hover:text-red-500 text-lg leading-none"
                      >×</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={stockSearch}
                        onChange={(e) => handleStockSearch(e.target.value)}
                        onFocus={async () => {
                          if (blurTimer.current) clearTimeout(blurTimer.current)
                          if (stockResults.length === 0) {
                            const data = await searchStockList("")
                            setStockResults(data)
                          }
                          setShowStockDrop(true)
                        }}
                        onBlur={() => { blurTimer.current = setTimeout(() => setShowStockDrop(false), 150) }}
                        placeholder="종목명 또는 코드 검색..."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {showStockDrop && stockResults.length > 0 && (
                        <div className="absolute top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto w-full">
                          {stockResults.map((item) => (
                            <button
                              key={item.code}
                              type="button"
                              onMouseDown={() => selectStock(item)}
                              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                            >
                              <span className="font-mono text-xs text-blue-600 font-semibold w-16 shrink-0">{item.code}</span>
                              <span className="text-sm text-gray-900 flex-1 truncate">{item.name}</span>
                              <span className="text-xs text-gray-400 shrink-0">{item.market}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 단가 / 수량 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">단가 (원)</label>
                    <input
                      type="number"
                      min={1}
                      placeholder="65900"
                      value={form.s_amt}
                      onChange={(e) => setForm((f) => ({ ...f, s_amt: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">수량 (주, 매도 시 음수)</label>
                    <input
                      type="number"
                      placeholder="10 또는 -10"
                      value={form.qty}
                      onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* 금액 미리보기 */}
                {form.qty && form.s_amt && (
                  <p className="text-xs text-gray-500">
                    총 금액: <span className="font-semibold text-gray-800">{won(Number(form.qty) * Number(form.s_amt))}</span>
                  </p>
                )}

                {formError && <p className="text-xs text-red-500">{formError}</p>}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-2.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                  >
                    {submitting ? "저장 중..." : "저장"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
