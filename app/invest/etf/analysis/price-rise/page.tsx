"use client"

import { useEffect, useState } from "react"
import AppLayout from "@/components/AppLayout"
import { getPriceRiseTop, getStockSeries, getEtfSummary } from "../../actions"
import { fmt, fmtKRW } from "@/lib/fmt"
import { StockSeriesPanel } from "../../components/StockSeriesPanel"

const ETF_LIST = [
  { value: "ALL", label: "전체 ETF" },
  { value: "IEMG", label: "IEMG" },
  { value: "EEM",  label: "EEM"  },
  { value: "EWY",  label: "EWY"  },
]

const PERIODS = [
  { label: "1개월", days: 30 },
  { label: "3개월", days: 90 },
  { label: "6개월", days: 180 },
  { label: "1년",   days: 365 },
  { label: "전체",  days: 9999 },
]

type TopItem = { ticker: string; name: string; location: string; first_price: number; last_price: number; price_change: number; pct_change: number }
type Series  = { holding_date: string; price: number; price_krw: number; market_currency: string; weight_pct: number; shares: number; market_value: number }
type EtfSummaryRow = { etf_ticker: string; last_date: string; first_date: string; last_mv_krw: number; first_mv_krw: number; mv_change_krw: number; mv_change_pct: number; stock_count: number }

const ETF_INFO: Record<string, { short: string; desc: string }> = {
  IEMG: { short: "iShares Core MSCI Emerging Markets ETF", desc: "신흥시장 전체 (~2,500종목) · 저비용·광범위 커버리지" },
  EEM:  { short: "iShares MSCI Emerging Markets ETF",      desc: "신흥시장 대형·중형주 (~800종목) · 대표적 신흥시장 ETF" },
  EWY:  { short: "iShares MSCI South Korea ETF",           desc: "한국 단일국가 ETF · MSCI Korea 지수 추종" },
}

const ETF_PRODUCT_PAGES: Record<string, string> = {
  IEMG: "https://www.ishares.com/us/products/244050/ishares-core-msci-emerging-markets-etf",
  EEM:  "https://www.ishares.com/us/products/239637/ishares-msci-emerging-markets-etf",
  EWY:  "https://www.ishares.com/us/products/239681/ishares-msci-south-korea-capped-etf",
}

export default function PriceRisePage() {
  const [etf, setEtf]             = useState("ALL")
  const [koreaOnly, setKoreaOnly]  = useState(true)
  const [period, setPeriod]        = useState(180)
  const [top, setTop]             = useState<TopItem[]>([])
  const [series, setSeries]       = useState<Series[]>([])
  const [selected, setSelected]   = useState<TopItem | null>(null)
  const [loading, setLoading]     = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [etfSummary, setEtfSummary] = useState<EtfSummaryRow[]>([])

  useEffect(() => {
    const daysParam = period === 9999 ? null : period
    setLoading(true)
    Promise.all([
      getPriceRiseTop(etf, koreaOnly ? "KR" : null, daysParam),
      getEtfSummary(daysParam),
    ]).then(([d, summary]) => {
      setTop(d); setSeries([]); setLoading(false)
      setEtfSummary(summary)
      if (d.length > 0) pickTicker(d[0]); else setSelected(null)
    })
  }, [etf, koreaOnly, period])

  function pickTicker(item: TopItem) {
    setSelected(item)
    setDetailLoading(true)
    getStockSeries(etf, item.ticker).then((d) => { setSeries(d); setDetailLoading(false) })
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - period)
  const chartData = series
    .filter((s) => period === 9999 || new Date(s.holding_date) >= cutoff)
    .map((s) => ({
      date: s.holding_date?.slice(0, 10),
      price: Number(s.price),
      price_krw: Number(s.price_krw),
      market_currency: s.market_currency,
      weight: Number(s.weight_pct),
      shares: Number(s.shares),
      nation_value: Math.round(Number(s.price_krw) * Number(s.shares)),
    }))

  const current = chartData[chartData.length - 1]
  const prev    = chartData[0]
  const priceChange = current && prev && prev.price_krw > 0
    ? ((current.price_krw - prev.price_krw) / prev.price_krw) * 100 : null

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-1">주가 상승 분석</h1>
        <p className="text-sm text-gray-500 mb-3">선택 기간 내 주가 상승(%)이 가장 높은 종목을 분석합니다.</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
          {(["IEMG", "EEM", "EWY"] as const).map((k) => {
            const info = ETF_INFO[k]
            const active = etf === k || etf === "ALL"
            return (
              <div key={k} className={`rounded-lg border px-3 py-2 transition-opacity ${active ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-40"}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-bold text-sm text-blue-700">{k}</span>
                  <span className="text-xs text-gray-500 truncate flex-1">{info.short}</span>
                  <a href={ETF_PRODUCT_PAGES[k]} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    최신 자료 보기
                  </a>
                </div>
                <p className="text-xs text-gray-400">{info.desc}</p>
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-3 mb-5">
          <select value={etf} onChange={(e) => setEtf(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white font-medium">
            {ETF_LIST.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
          <button onClick={() => setKoreaOnly(!koreaOnly)}
            className={`px-4 py-2 text-sm rounded-lg border font-medium transition-colors ${koreaOnly ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-700 bg-white hover:bg-gray-50"}`}>
            한국 종목만
          </button>
          <div className="flex border border-gray-300 rounded-lg overflow-hidden">
            {PERIODS.map((p) => (
              <button key={p.days} onClick={() => setPeriod(p.days)}
                className={`px-3 py-2 text-sm font-medium ${period === p.days ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {etfSummary.length > 0 && (() => {
          const totalMv = etfSummary.reduce((sum, s) => sum + Number(s.last_mv_krw), 0)
          return (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              {etfSummary.map((s) => {
                const active    = etf === s.etf_ticker || etf === "ALL"
                const lastMv    = Number(s.last_mv_krw)
                const firstMv   = Number(s.first_mv_krw)
                const chgKrw    = Number(s.mv_change_krw)
                const chgPct    = Number(s.mv_change_pct)
                const cnt       = Number(s.stock_count)
                const up = chgKrw > 0; const dn = chgKrw < 0
                const chgCls = up ? "text-red-600" : dn ? "text-blue-600" : "text-gray-400"
                const etfShare  = totalMv > 0 ? lastMv / totalMv * 100 : 0
                const avgPerStk = cnt > 0 ? lastMv / cnt : 0
                return (
                  <div key={s.etf_ticker} className={`rounded-xl border px-4 py-3 transition-opacity ${active ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100 opacity-40"}`}>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-bold text-blue-700 text-sm">{s.etf_ticker}</span>
                      <span className="font-semibold text-gray-900 text-sm">{fmtKRW(lastMv)}</span>
                      <span className={`text-sm font-medium ${chgCls}`}>
                        {up ? "+" : ""}{fmtKRW(chgKrw)}({up ? "+" : ""}{fmt(chgPct, 1)}%)
                      </span>
                      <span className="text-xs text-gray-400">{fmt(cnt, 0)}종목</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-100 space-y-1 text-xs">
                      <div className="flex justify-between text-gray-500">
                        <span>분석 기간</span>
                        <span className="text-gray-600">{s.first_date} ~ {s.last_date}</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>기초 보유금액</span>
                        <span className="text-gray-600">{fmtKRW(firstMv)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>3개 ETF 대비 비중</span>
                        <span className="text-gray-600">{fmt(etfShare, 1)}%</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>종목당 평균 보유</span>
                        <span className="text-gray-600">{fmtKRW(avgPerStk)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {loading && <p className="text-center text-gray-400 py-8">로딩 중...</p>}

        {!loading && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">
                주가 상승(%) TOP 20 <span className="text-xs font-normal text-gray-500 ml-1">행을 클릭하면 상세 조회</span>
              </h3>
            </div>
            <div className="overflow-x-auto">
              <div className="max-h-[320px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <tr>
                    {["#", "티커", "종목명", "시작가(원)", "현재가(원)", "변동금액", "상승(%)"].map((h, i) => (
                      <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-700 ${i <= 2 ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {top.map((t, idx) => (
                    <tr key={t.ticker}
                      onClick={() => pickTicker(t)}
                      className={`cursor-pointer transition-colors ${selected?.ticker === t.ticker ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                      <td className="px-4 py-2.5 text-gray-400 text-xs w-8">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{t.ticker}</td>
                      <td className="px-4 py-2.5 text-gray-900 font-medium max-w-[160px] truncate">
                        {t.name}
                        {t.location && <span className="ml-1.5 text-xs text-gray-400 font-normal">{t.location}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{fmt(t.first_price, 0)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-900 font-medium">{fmt(t.last_price, 0)}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${Number(t.price_change) > 0 ? "text-red-600" : "text-blue-600"}`}>
                        {Number(t.price_change) > 0 ? "+" : ""}{fmt(t.price_change, 0)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-bold ${Number(t.pct_change) > 0 ? "text-red-600" : "text-blue-600"}`}>
                        {Number(t.pct_change) > 0 ? "+" : ""}{fmt(t.pct_change, 1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}

        {!selected && !loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            위 차트에서 종목을 클릭하면 상세 조회가 표시됩니다.
          </div>
        )}

        {selected && (
          <>
            {detailLoading && <p className="text-center text-gray-400 py-8">로딩 중...</p>}

            {!detailLoading && chartData.length > 0 && (
              <>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2.5">
                    <span className="font-semibold text-blue-600 text-sm">분석 결과</span>
                    <span className="font-semibold text-gray-900 text-sm">{selected.name}</span>
                    <span className="text-xs font-mono text-gray-500">{selected.ticker}</span>
                    {selected.location && <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{selected.location}</span>}
                    <span className={`text-xs font-medium ml-auto ${Number(selected.pct_change) >= 0 ? "text-red-600" : "text-blue-600"}`}>
                      상승률 {Number(selected.pct_change) > 0 ? "+" : ""}{fmt(Number(selected.pct_change), 1)}%
                    </span>
                  </div>
                  {(() => {
                    const cc = (v: number | null) => v == null ? "text-gray-400" : v > 0 ? "text-red-600" : v < 0 ? "text-blue-600" : "text-gray-400"
                    return (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            {["분석 항목", "기초", "기말", "증감", "증감률"].map((h, i) => (
                              <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-600 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {([
                            { label: "주가",    base: prev.price_krw,          last: current.price_krw,          dec: 0, suffix: "원",  hasScore: true  },
                            { label: "보유 비중", base: prev.weight,             last: current.weight,             dec: 1, suffix: "%",   hasScore: true  },
                            { label: "보유 수량",    base: prev.shares,             last: current.shares,             dec: 0, suffix: "",    hasScore: true  },
                            { label: "보유 금액",        base: prev.nation_value / 1e8, last: current.nation_value / 1e8, dec: 0, suffix: "억원", hasScore: true  },
                          ] as { label: string; base: number; last: number; dec: number; suffix: string; hasScore: boolean }[]).map(({ label, base, last, dec, suffix, hasScore }) => {
                            const change = last - base
                            const score  = base !== 0 ? change / base * 100 : null
                            return (
                              <tr key={label}>
                                <td className="px-4 py-2.5 text-gray-700 font-medium">{label}</td>
                                <td className="px-4 py-2.5 text-right text-gray-600">{fmt(base, dec)}{suffix}</td>
                                <td className="px-4 py-2.5 text-right text-gray-900 font-medium">{fmt(last, dec)}{suffix}</td>
                                <td className={`px-4 py-2.5 text-right font-medium ${cc(change)}`}>
                                  {change > 0 ? "+" : ""}{fmt(change, dec)}{suffix}
                                </td>
                                <td className={`px-4 py-2.5 text-right font-bold ${cc(score)}`}>
                                  {score != null ? `${score > 0 ? "+" : ""}${fmt(score, 1)}%` : "—"}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )
                  })()}
                </div>

                <StockSeriesPanel data={chartData} />
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
