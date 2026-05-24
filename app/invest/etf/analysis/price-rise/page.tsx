"use client"

import { useEffect, useState } from "react"
import AppLayout from "@/components/AppLayout"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer  } from "recharts"
import { getPriceRiseTop, getStockSeries } from "../../actions"
import { fmt, fmtKRW } from "@/lib/fmt"

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

const TT = {
  contentStyle: { fontSize: 12, padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6 },
  labelStyle:   { fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 2 },
  itemStyle:    { fontSize: 12, padding: "1px 0" },
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

  useEffect(() => {
    setLoading(true)
    getPriceRiseTop(etf, koreaOnly ? "KR" : null, period === 9999 ? null : period).then((d) => {
      setTop(d); setSeries([]); setLoading(false)
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
        <p className="text-sm text-gray-500 mb-4">선택 기간 내 주가 상승(%)이 가장 높은 종목을 분석합니다.</p>

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

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">주가 추이</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#374151" }} tickFormatter={(v) => v.slice(5)} />
                        <YAxis tick={{ fontSize: 10, fill: "#374151" }} domain={["auto", "auto"]} />
                        <Tooltip formatter={(v: unknown) => fmt(v as number, 0)} labelFormatter={(l) => String(l)} {...TT} />
                        <Line type="monotone" dataKey="price_krw" stroke="#2563eb" dot={false} strokeWidth={2} name="주가(KRW)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">비중(%) 추이</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#374151" }} tickFormatter={(v) => v.slice(5)} />
                        <YAxis tick={{ fontSize: 10, fill: "#374151" }} domain={["auto", "auto"]} />
                        <Tooltip formatter={(v: unknown) => `${fmt(v as number, 1)}%`} labelFormatter={(l) => String(l)} {...TT} />
                        <Line type="monotone" dataKey="weight" stroke="#16a34a" dot={false} strokeWidth={2} name="비중" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {["날짜", "주가", "주가 증감", "보유 비중", "비중 증감률", "보유수량", "수량 증감", "총 보유 금액", "보유 금액 증감"].map((h, i) => (
                            <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-700 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(() => { const rev = [...chartData].reverse(); return rev.map((row, i) => {
                          const prevRow = rev[i + 1]
                          const priceDiff  = prevRow ? row.price_krw - prevRow.price_krw : null
                          const pctChg     = prevRow && prevRow.price_krw > 0
                            ? ((row.price_krw - prevRow.price_krw) / prevRow.price_krw) * 100 : null
                          const sharesDiff = prevRow ? row.shares - prevRow.shares : null
                          const nationDiff = prevRow ? row.nation_value - prevRow.nation_value : null
                          const isKrw = row.market_currency === "KRW"
                          const priceDisplay = isKrw ? fmt(row.price_krw, 0) : `${fmt(row.price_krw, 0)} (USD ${fmt(row.price, 4)})`
                          const cc = (v: number | null) => v == null ? "text-gray-400" : v > 0 ? "text-red-600" : v < 0 ? "text-blue-600" : "text-gray-400"
                          return (
                            <tr key={row.date} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5 text-left text-gray-700">{row.date}</td>
                              <td className="px-4 py-2.5 text-right text-gray-900 font-medium">{priceDisplay}</td>
                              <td className={`px-4 py-2.5 text-right font-medium ${cc(priceDiff)}`}>
                                {priceDiff != null ? `${priceDiff > 0 ? "+" : ""}${fmt(priceDiff, 0)}` : "-"}
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-900 font-medium">{fmt(row.weight, 1)}%</td>
                              <td className={`px-4 py-2.5 text-right font-medium ${cc(pctChg)}`}>
                                {pctChg != null ? `${pctChg > 0 ? "+" : ""}${fmt(pctChg, 1)}%` : "-"}
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-900 font-medium">{fmt(row.shares, 0)}</td>
                              <td className={`px-4 py-2.5 text-right font-medium ${cc(sharesDiff)}`}>
                                {sharesDiff != null ? `${sharesDiff > 0 ? "+" : ""}${fmt(sharesDiff, 0)}` : "-"}
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-900 font-medium">{fmtKRW(row.nation_value)}</td>
                              <td className={`px-4 py-2.5 text-right font-medium ${cc(nationDiff)}`}>
                                {nationDiff != null ? `${nationDiff > 0 ? "+" : ""}${fmtKRW(nationDiff)}` : "-"}
                              </td>
                            </tr>
                          )
                        })})()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
