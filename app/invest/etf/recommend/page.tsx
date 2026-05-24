"use client"

import { useEffect, useState } from "react"
import AppLayout from "@/components/AppLayout"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { getRecommend, getStockSeries, getStockEtfWeights, getEtfSummary } from "../actions"
import { fmt, fmtKRW, fmtShares } from "@/lib/fmt"

const ETF_LIST = [
  { value: "ALL",  label: "전체 ETF" },
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

const ETF_INFO: Record<string, { short: string; desc: string }> = {
  IEMG: { short: "iShares Core MSCI Emerging Markets ETF", desc: "신흥시장 전체 (~2,500종목) · 저비용·광범위 커버리지" },
  EEM:  { short: "iShares MSCI Emerging Markets ETF",      desc: "신흥시장 대형·중형주 (~800종목) · 대표적 신흥시장 ETF" },
  EWY:  { short: "iShares MSCI South Korea ETF",           desc: "한국 단일국가 ETF · MSCI Korea 지수 추종" },
}

type Stock = {
  ticker: string; name: string; sector: string; location: string
  last_price: number; last_weight: number; last_shares: number
  weight_change: number; shares_change: number; price_change_pct: number
  recent_weight_change: number; recent_shares_change: number; recent_price_change_pct: number
  full_days: number
}
type Series = { holding_date: string; price: number; price_krw: number; market_currency: string; weight_pct: number; shares: number; market_value: number }
type EtfSummaryRow = {
  etf_ticker: string; last_date: string; first_date: string
  last_mv_krw: number; first_mv_krw: number
  mv_change_krw: number; mv_change_pct: number; stock_count: number
}

const TT = {
  contentStyle: { fontSize: 12, padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6 },
  labelStyle:   { fontSize: 11, fontWeight: 600 as const, color: "#374151", marginBottom: 2 },
  itemStyle:    { fontSize: 12, padding: "1px 0" },
}

type ScoreDetail = { total: number; weight: number; shares: number; price: number }

// 감쇠 계수: 최근 14일 일변화율 70% + 전체 기간 일변화율 30%
const DECAY_ALPHA = 0.7
const RECENT_DAYS = 14

function computeRelativeScores(list: Stock[]): Map<string, ScoreDetail> {
  const result = new Map<string, ScoreDetail>()
  if (list.length === 0) return result
  const n = list.length

  function relScore(values: number[], maxPts: number): number[] {
    const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
    const scores = new Array<number>(n).fill(0)
    indexed.forEach(({ i }, rank) => {
      scores[i] = n === 1 ? maxPts : Math.round((rank / (n - 1)) * maxPts)
    })
    return scores
  }

  const wValues = list.map((s) => {
    const fd = Math.max(1, Number(s.full_days))
    return DECAY_ALPHA * Math.max(0, Number(s.recent_weight_change)) / RECENT_DAYS
         + (1 - DECAY_ALPHA) * Math.max(0, Number(s.weight_change)) / fd
  })
  const sValues = list.map((s) => {
    const fd = Math.max(1, Number(s.full_days))
    return DECAY_ALPHA * Math.max(0, Number(s.recent_shares_change)) / RECENT_DAYS
         + (1 - DECAY_ALPHA) * Math.max(0, Number(s.shares_change)) / fd
  })
  const pValues = list.map((s) => {
    const fd = Math.max(1, Number(s.full_days))
    return DECAY_ALPHA * Math.abs(Number(s.recent_price_change_pct)) / RECENT_DAYS
         + (1 - DECAY_ALPHA) * Math.abs(Number(s.price_change_pct)) / fd
  })

  const wScores = relScore(wValues, 35)
  const sScores = relScore(sValues, 35)
  const pScores = relScore(pValues, 30)

  list.forEach((s, i) => {
    result.set(s.ticker, {
      weight: wScores[i],
      shares: sScores[i],
      price:  pScores[i],
      total:  wScores[i] + sScores[i] + pScores[i],
    })
  })
  return result
}

function ScoreBadge({ v }: { v: number }) {
  const color = v >= 70 ? "bg-green-100 text-green-700" : v >= 40 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{v}pt</span>
}

export default function RecommendPage() {
  const [etf, setEtf]             = useState("ALL")
  const [koreaOnly, setKoreaOnly]  = useState(true)
  const [period, setPeriod]        = useState(180)
  const [list, setList]           = useState<Stock[]>([])
  const [loading, setLoading]     = useState(false)
  const [selected, setSelected]   = useState<string | null>(null)
  const [series, setSeries]       = useState<Series[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [etfWeightMap, setEtfWeightMap] = useState<Map<string, { etf: string; pct: number }[]>>(new Map())
  const [etfSummary, setEtfSummary]     = useState<EtfSummaryRow[]>([])

  useEffect(() => {
    setLoading(true)
    setSelected(null)
    setSeries([])
    setEtfWeightMap(new Map())
    const daysParam = period === 9999 ? null : period
    Promise.all([
      getRecommend(etf, koreaOnly ? "KR" : null, daysParam),
      getEtfSummary(daysParam),
    ]).then(([stocks, summary]) => {
      setList(stocks)
      setEtfSummary(summary)
      setLoading(false)
      if (stocks.length > 0) {
        getStockEtfWeights(stocks.map((s) => s.ticker)).then((weights) => {
          const map = new Map<string, { etf: string; pct: number }[]>()
          weights.forEach((w) => {
            const arr = map.get(w.ticker) ?? []
            arr.push({ etf: w.etf_ticker, pct: Number(w.weight_pct) })
            map.set(w.ticker, arr)
          })
          setEtfWeightMap(map)
        })
      }
    })
  }, [etf, koreaOnly, period])

  function handleSelect(ticker: string) {
    if (selected === ticker) { setSelected(null); setSeries([]); return }
    setSelected(ticker)
    setDetailLoading(true)
    getStockSeries(etf, ticker).then((d) => { setSeries(d); setDetailLoading(false) })
  }

  const scoreMap = computeRelativeScores(list)
  const sorted = [...list].sort((a, b) =>
    (scoreMap.get(b.ticker)?.total ?? 0) - (scoreMap.get(a.ticker)?.total ?? 0)
  )

  const selectedIdx = sorted.findIndex((s) => s.ticker === selected)
  const miniStart   = selectedIdx >= 0 ? Math.max(0, selectedIdx - 3) : 0
  const miniEnd     = selectedIdx >= 0 ? Math.min(sorted.length, selectedIdx + 4) : 0
  const miniCards   = selectedIdx >= 0 ? sorted.slice(miniStart, miniEnd) : []

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
  const selectedStock = selected ? sorted.find((s) => s.ticker === selected) : null

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-3">추천 종목</h1>

        {/* ① ETF 설명 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          {(["IEMG", "EEM", "EWY"] as const).map((k) => {
            const info = ETF_INFO[k]
            const active = etf === k || etf === "ALL"
            return (
              <div key={k} className={`rounded-lg border px-3 py-2 transition-opacity ${active ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-40"}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-bold text-sm text-blue-700">{k}</span>
                  <span className="text-xs text-gray-500 truncate">{info.short}</span>
                </div>
                <p className="text-xs text-gray-400">{info.desc}</p>
              </div>
            )
          })}
        </div>

        {/* ② 평가 기준 설명 */}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500 bg-gray-50 rounded-lg px-4 py-2.5 mb-4 border border-gray-100">
          <span><span className="font-semibold text-gray-600">평가 기준</span> 조회 종목 내 상대평가 (0~100pt)</span>
          <span><span className="font-semibold text-gray-600">평가 비중</span> 비중 증가율(0~35pt) · 수량 증가율(0~35pt) · 주가 상승률(0~30pt)</span>
          <span><span className="font-semibold text-gray-600">평가 방법</span> 시간감쇠 — 최근 14일 70% · 전체기간 30%</span>
        </div>

        {/* 필터 컨트롤 */}
        <div className="flex flex-wrap gap-3 mb-4">
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

        {/* ④ ETF별 금액·추세 요약 */}
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
                    {/* 1줄 요약 */}
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-bold text-blue-700 text-sm">{s.etf_ticker}</span>
                      <span className="font-semibold text-gray-900 text-sm">{fmtKRW(lastMv)}</span>
                      <span className={`text-sm font-medium ${chgCls}`}>
                        {up ? "+" : ""}{fmtKRW(chgKrw)}({up ? "+" : ""}{fmt(chgPct, 1)}%)
                      </span>
                      <span className="text-xs text-gray-400">{fmt(cnt, 0)}종목</span>
                    </div>
                    {/* 분석 내용 */}
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

        {/* 일반 상태: 전체 카드 그리드 */}
        {!loading && !selected && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {sorted.map((s) => {
              const sc = scoreMap.get(s.ticker)!
              const wc = Number(s.weight_change)
              const shc = Number(s.shares_change)
              const pc = Number(s.price_change_pct)
              const lastPrice  = Number(s.last_price)
              const lastWeight = Number(s.last_weight)
              const lastShares = Number(s.last_shares)
              const basePrice  = pc !== -100 ? lastPrice / (1 + pc / 100) : 0
              const baseWeight = lastWeight - wc
              const baseShares = lastShares - shc
              const priceDiff  = lastPrice - basePrice
              const weightRate = baseWeight !== 0 ? wc / baseWeight * 100 : null
              const sharesRate = baseShares !== 0 ? shc / baseShares * 100 : null
              const lastNation = Math.round(lastPrice * lastShares)
              const baseNation = Math.round(basePrice * baseShares)
              const nationDiff = lastNation - baseNation
              const nationRate = baseNation !== 0 ? nationDiff / baseNation * 100 : null
              const cc = (v: number | null) => v == null ? "text-gray-400" : v > 0 ? "text-red-600" : v < 0 ? "text-blue-600" : "text-gray-400"
              const ptCls = (v: number, max: number) =>
                v >= max * 0.75 ? "text-green-600 font-bold" : v >= max * 0.4 ? "text-blue-600 font-bold" : "text-gray-400"
              const etfWts = etfWeightMap.get(s.ticker) ?? []
              return (
                <div key={s.ticker}
                  onClick={() => handleSelect(s.ticker)}
                  className="bg-white rounded-xl border border-gray-200 hover:shadow-sm hover:border-blue-300 transition-all cursor-pointer overflow-hidden">
                  <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
                    <div className="min-w-0 flex-1">
                      {/* 종목명 + ETF 비중 (같은 줄) */}
                      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                        <span className="font-semibold text-gray-900 text-sm">{s.name}</span>
                        {etfWts.map((w) => (
                          <span key={w.etf} className="text-xs text-blue-600 bg-blue-50 px-1 py-0.5 rounded font-medium whitespace-nowrap">
                            {w.etf}: {fmt(w.pct, 1)}%
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-xs font-mono text-gray-500">{s.ticker}</span>
                        {s.location && <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{s.location}</span>}
                        {s.sector && <span className="text-xs text-gray-400">{s.sector}</span>}
                      </div>
                    </div>
                    <ScoreBadge v={sc.total} />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-t border-gray-100">
                      <thead className="bg-gray-50">
                        <tr>
                          {["분석 항목", "기초", "기말", "증감", "증감률", "평가 점수"].map((h, i) => (
                            <th key={h} className={`px-2 py-1.5 whitespace-nowrap font-semibold text-gray-500 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        <tr>
                          <td className="px-1.5 py-1 whitespace-nowrap text-gray-600">주가</td>
                          <td className="px-1.5 py-1 whitespace-nowrap text-right text-gray-500">{fmt(basePrice, 0)}원</td>
                          <td className="px-1.5 py-1 whitespace-nowrap text-right text-gray-900 font-medium">{fmt(lastPrice, 0)}원</td>
                          <td className={`px-1.5 py-1 whitespace-nowrap text-right font-medium ${cc(priceDiff)}`}>{priceDiff > 0 ? "+" : ""}{fmt(priceDiff, 0)}원</td>
                          <td className={`px-1.5 py-1 whitespace-nowrap text-right font-bold ${cc(pc)}`}>{pc > 0 ? "+" : ""}{fmt(pc, 1)}%</td>
                          <td className={`px-1.5 py-1 whitespace-nowrap text-right ${ptCls(sc.price, 30)}`}>{sc.price}/30pt</td>
                        </tr>
                        <tr>
                          <td className="px-1.5 py-1 whitespace-nowrap text-gray-600">보유 비중</td>
                          <td className="px-1.5 py-1 whitespace-nowrap text-right text-gray-500">{fmt(baseWeight, 1)}%</td>
                          <td className="px-1.5 py-1 whitespace-nowrap text-right text-gray-900 font-medium">{fmt(lastWeight, 1)}%</td>
                          <td className={`px-1.5 py-1 whitespace-nowrap text-right font-medium ${cc(wc)}`}>{wc > 0 ? "+" : ""}{fmt(wc, 1)}%</td>
                          <td className={`px-1.5 py-1 whitespace-nowrap text-right font-bold ${cc(weightRate)}`}>{weightRate != null ? `${weightRate > 0 ? "+" : ""}${fmt(weightRate, 1)}%` : "—"}</td>
                          <td className={`px-1.5 py-1 whitespace-nowrap text-right ${ptCls(sc.weight, 35)}`}>{sc.weight}/35pt</td>
                        </tr>
                        <tr>
                          <td className="px-1.5 py-1 whitespace-nowrap text-gray-600">보유 수량</td>
                          <td className="px-1.5 py-1 whitespace-nowrap text-right text-gray-500">{fmtShares(baseShares)}</td>
                          <td className="px-1.5 py-1 whitespace-nowrap text-right text-gray-900 font-medium">{fmtShares(lastShares)}</td>
                          <td className={`px-1.5 py-1 whitespace-nowrap text-right font-medium ${cc(shc)}`}>{shc > 0 ? "+" : ""}{fmtShares(shc)}</td>
                          <td className={`px-1.5 py-1 whitespace-nowrap text-right font-bold ${cc(sharesRate)}`}>{sharesRate != null ? `${sharesRate > 0 ? "+" : ""}${fmt(sharesRate, 1)}%` : "—"}</td>
                          <td className={`px-1.5 py-1 whitespace-nowrap text-right ${ptCls(sc.shares, 35)}`}>{sc.shares}/35pt</td>
                        </tr>
                        <tr>
                          <td className="px-1.5 py-1 whitespace-nowrap text-gray-600">보유 금액</td>
                          <td className="px-1.5 py-1 whitespace-nowrap text-right text-gray-500">{fmtKRW(baseNation)}</td>
                          <td className="px-1.5 py-1 whitespace-nowrap text-right text-gray-900 font-medium">{fmtKRW(lastNation)}</td>
                          <td className={`px-1.5 py-1 whitespace-nowrap text-right font-medium ${cc(nationDiff)}`}>{nationDiff > 0 ? "+" : ""}{fmtKRW(nationDiff)}</td>
                          <td className={`px-1.5 py-1 whitespace-nowrap text-right font-bold ${cc(nationRate)}`}>{nationRate != null ? `${nationRate > 0 ? "+" : ""}${fmt(nationRate, 1)}%` : "—"}</td>
                          <td className="px-1.5 py-1 whitespace-nowrap text-right text-gray-400">—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 선택 상태 */}
        {!loading && selected && (
          <>
            {/* 미니 카드 행 */}
            <div className="flex gap-3 overflow-x-auto pb-3 mb-5">
              {miniCards.map((s) => {
                const sc = scoreMap.get(s.ticker)!
                const isActive = s.ticker === selected
                return (
                  <div key={s.ticker}
                    onClick={() => handleSelect(s.ticker)}
                    className={`flex-none w-40 rounded-xl border p-3 cursor-pointer transition-all ${
                      isActive ? "border-blue-500 bg-blue-50 shadow-sm" : "border-gray-200 bg-white hover:border-blue-300"
                    }`}>
                    <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{s.name}</p>
                    <p className="text-xs font-mono text-gray-500 mt-0.5">{s.ticker}</p>
                    <div className="mt-2"><ScoreBadge v={sc.total} /></div>
                  </div>
                )
              })}
            </div>

            {detailLoading && <p className="text-center text-gray-400 py-8">로딩 중...</p>}

            {!detailLoading && selectedStock && (
              <>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2.5">
                    <span className="font-semibold text-blue-600 text-sm">분석 결과</span>
                    <span className="font-semibold text-gray-900 text-sm">{selectedStock.name}</span>
                    <span className="text-xs font-mono text-gray-500">{selectedStock.ticker}</span>
                    {selectedStock.location && <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{selectedStock.location}</span>}
                    {(() => { const sc = scoreMap.get(selectedStock.ticker); return sc ? <span className="text-xs font-bold ml-auto text-blue-600">{sc.total}pt</span> : null })()}
                  </div>
                  {chartData.length > 0 && (() => {
                    const cc = (v: number | null) => v == null ? "text-gray-400" : v > 0 ? "text-red-600" : v < 0 ? "text-blue-600" : "text-gray-400"
                    const scDetail = scoreMap.get(selectedStock!.ticker)
                    const ptCls = (v: number, max: number) =>
                      v >= max * 0.75 ? "text-green-600 font-bold" : v >= max * 0.4 ? "text-blue-600 font-bold" : "text-gray-400"
                    return (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            {["분석 항목", "기초", "기말", "증감", "증감률", "평가 점수"].map((h, i) => (
                              <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-600 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {([
                            { label: "주가",      base: prev.price_krw,    last: current.price_krw,    dec: 0, suffix: "원", fmtVal: undefined as ((n: number) => string) | undefined, scorePt: scDetail?.price,  scoreMax: 30 as number | undefined },
                            { label: "보유 비중", base: prev.weight,       last: current.weight,       dec: 1, suffix: "%",  fmtVal: undefined,                                         scorePt: scDetail?.weight, scoreMax: 35 },
                            { label: "보유 수량", base: prev.shares,       last: current.shares,       dec: 0, suffix: "",   fmtVal: fmtShares,                                         scorePt: scDetail?.shares, scoreMax: 35 },
                            { label: "보유 금액", base: prev.nation_value, last: current.nation_value, dec: 0, suffix: "",   fmtVal: fmtKRW,                                            scorePt: undefined,        scoreMax: undefined },
                          ]).map(({ label, base, last, dec, suffix, fmtVal, scorePt, scoreMax }) => {
                            const change = last - base
                            const score  = base !== 0 ? change / base * 100 : null
                            const disp   = fmtVal ?? ((n: number) => `${fmt(n, dec)}${suffix}`)
                            return (
                              <tr key={label}>
                                <td className="px-4 py-2.5 text-gray-700 font-medium">{label}</td>
                                <td className="px-4 py-2.5 text-right text-gray-600">{disp(base)}</td>
                                <td className="px-4 py-2.5 text-right text-gray-900 font-medium">{disp(last)}</td>
                                <td className={`px-4 py-2.5 text-right font-medium ${cc(change)}`}>
                                  {change > 0 ? "+" : ""}{disp(change)}
                                </td>
                                <td className={`px-4 py-2.5 text-right font-bold ${cc(score)}`}>
                                  {score != null ? `${score > 0 ? "+" : ""}${fmt(score, 1)}%` : "—"}
                                </td>
                                <td className={`px-4 py-2.5 text-right ${scorePt != null && scoreMax != null ? ptCls(scorePt, scoreMax) : "text-gray-400"}`}>
                                  {scorePt != null && scoreMax != null ? `${scorePt}/${scoreMax}pt` : "—"}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )
                  })()}
                </div>

                {chartData.length > 0 && (
                  <>
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
                            {(() => {
                              const rev = [...chartData].reverse()
                              return rev.map((row, i) => {
                                const prevRow = rev[i + 1]
                                const priceDiff  = prevRow ? row.price_krw - prevRow.price_krw : null
                                const pctChg     = prevRow && prevRow.price_krw > 0
                                  ? ((row.price_krw - prevRow.price_krw) / prevRow.price_krw) * 100 : null
                                const sharesDiff = prevRow ? row.shares - prevRow.shares : null
                                const nationDiff = prevRow ? row.nation_value - prevRow.nation_value : null
                                const isKrw = row.market_currency === "KRW"
                                const priceDisplay = isKrw
                                  ? fmt(row.price_krw, 0)
                                  : `${fmt(row.price_krw, 0)} (USD ${fmt(row.price, 4)})`
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
                              })
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
