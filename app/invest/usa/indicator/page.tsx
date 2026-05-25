"use client"

import { useEffect, useState, useRef } from "react"
import AppLayout from "@/components/AppLayout"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { fmt, cc } from "@/lib/fmt"
import { getIndicatorList, getIndicatorSeries, getIndicatorLatest } from "../actions"
import type { IndicatorMeta, IndicatorCard } from "../actions"

const INDICATOR_DESC: Record<string, string> = {
  FEDFUNDS:     "연준(Fed)이 결정하는 단기 정책금리. 시장의 모든 금리 수준을 좌우하는 기준점으로, 인상 시 대출·채권금리 상승, 인하 시 경기 부양 효과.",
  GS10:         "10년 만기 미국 국채 수익률. 시장이 예상하는 장기 인플레이션·성장률을 반영하며, 글로벌 장기금리의 벤치마크.",
  GS30:         "30년 만기 미국 국채 수익률. 초장기 재정 건전성과 인플레이션 전망을 반영하며, 모기지·연금 등 장기 금융상품 금리에 연동.",
  MORTGAGE30US: "30년 고정 주택담보대출 금리. 미국 주택 구매 여력을 직접 결정하며, 부동산 시장 과열·침체의 선행 지표.",
  PAYEMS:       "농업 제외 전 산업 분야의 월별 신규 취업자 수. 미국 경제 성장 강도를 가장 빠르게 확인하는 고용 핵심 지표.",
  PCEPI:        "개인소비지출(PCE) 기반 물가지수. 연준이 공식 기준으로 삼는 인플레이션 척도로, 목표치는 전년 대비 +2%.",
  UNRATE:       "경제 활동인구(취업자+구직자) 중 실업자 비율. 수치가 낮을수록 노동시장이 타이트하여 임금·물가 상승 압력이 높아짐.",
}

const INDICATOR_LINKS: Record<string, string> = {
  FEDFUNDS:     "https://kr.investing.com/economic-calendar/interest-rate-decision-168",
  GS10:         "https://kr.investing.com/rates-bonds/u.s.-10-year-bond-yield",
  GS30:         "https://kr.investing.com/rates-bonds/u.s.-30-year-bond-yield",
  MORTGAGE30US: "https://kr.investing.com/economic-calendar/mba-30-year-mortgage-rate-1042",
  PAYEMS:       "https://kr.investing.com/economic-calendar/nonfarm-payrolls-227",
  PCEPI:        "https://kr.investing.com/economic-calendar/pce-price-index-906",
  UNRATE:       "https://kr.investing.com/economic-calendar/unemployment-rate-300",
}

const PERIODS = [
  { label: "1년",   months: 12  },
  { label: "2년",   months: 24  },
  { label: "5년",   months: 60  },
  { label: "전체",  months: undefined },
]

function fmtCard(v: number | null, unit: string): string {
  if (v == null) return "-"
  if (unit === "%" || unit === "%p") return `${fmt(v, 2)}%`
  return Number(v).toLocaleString("ko-KR", { maximumFractionDigits: 2 })
}

export default function IndicatorPage() {
  const [indicators, setIndicators] = useState<IndicatorMeta[]>([])
  const [cards, setCards]           = useState<IndicatorCard[]>([])
  const [code, setCode]             = useState<string>("")
  const [months, setMonths]         = useState<number | undefined>(24)
  const [series, setSeries]         = useState<{ stat_date: string; value: number }[]>([])
  const [loading, setLoading]       = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getIndicatorList().then((list) => {
      setIndicators(list)
      if (list.length > 0) setCode(list[0].indicator_code)
    })
    getIndicatorLatest().then(setCards)
  }, [])

  useEffect(() => {
    if (!code) return
    setLoading(true)
    getIndicatorSeries(code, months).then((d) => { setSeries(d); setLoading(false) })
  }, [code, months])

  const meta = indicators.find((i) => i.indicator_code === code)
  const chartData = series.map((r) => ({ date: r.stat_date.slice(0, 10), value: r.value }))

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">미국 경제 지표</h1>
      <p className="text-sm text-gray-500 mb-4">FRED 지표별 시계열 추이를 확인합니다.</p>

      {cards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          {cards.map((c) => {
            const diff = c.latest_value != null && c.prev_value != null ? c.latest_value - c.prev_value : null
            const isPos = diff != null && diff > 0
            const isNeg = diff != null && diff < 0
            const isActive = code === c.indicator_code
            return (
              <div
                key={c.indicator_code}
                onClick={() => {
                  setCode(c.indicator_code)
                  setTimeout(() => chartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100)
                }}
                className={`rounded-xl border p-4 cursor-pointer transition-all hover:shadow-sm ${isActive ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-200"}`}
              >
                <p className="text-sm font-bold text-gray-900 mb-1">{c.indicator_name}</p>
                <p className="text-xs text-gray-500 leading-snug mb-3">{INDICATOR_DESC[c.indicator_code] ?? ""}</p>
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-xs text-gray-400">{c.latest_date?.slice(0, 7) ?? ""}</span>
                  <span>
                    <span className="text-base font-bold text-gray-900">{fmtCard(c.latest_value, c.unit)}</span>
                    {diff != null && (
                      <span className={`text-xs ml-1 ${cc(diff)}`}>
                        ({diff != null && diff > 0 ? "+" : ""}{fmtCard(diff, c.unit)})
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white font-medium"
        >
          {indicators.map((i) => (
            <option key={i.indicator_code} value={i.indicator_code}>
              {i.indicator_name} ({i.indicator_code})
            </option>
          ))}
        </select>

        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.label}
              onClick={() => setMonths(p.months)}
              className={`px-3 py-2 text-sm rounded-lg border font-medium transition-colors ${
                months === p.months
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {INDICATOR_LINKS[code] && (
          <a
            href={INDICATOR_LINKS[code]}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            최신 자료 보기
          </a>
        )}
      </div>

      {loading && <p className="text-center text-gray-400 py-8">로딩 중...</p>}

      {!loading && chartData.length > 0 && (
        <div ref={chartRef} className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickFormatter={(v) => v.slice(0, 7)}
                  interval="preserveStartEnd"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickFormatter={(v) => Number(v).toLocaleString()}
                  width={60}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, "auto"]}
                />
                <Tooltip
                  formatter={(v: unknown) => [fmt(Number(v)), meta?.indicator_name ?? ""]}
                  labelFormatter={(l) => {
                    const [year, month] = String(l).split("-")
                    return `${year}년 ${parseInt(month)}월`
                  }}
                  contentStyle={{ fontSize: 12, padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6 }}
                  labelStyle={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 2 }}
                  itemStyle={{ fontSize: 12, padding: "1px 0" }}
                  cursor={{ fill: "#f3f4f6" }}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[3, 3, 0, 0]} name={meta?.indicator_name} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {(["날짜", "값", "전기 대비"] as const).map((h) => (
                      <th key={h} className={`px-4 py-2 text-xs font-semibold text-gray-700 ${h === "날짜" ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...chartData].reverse().map((r, i, arr) => {
                    const prev = arr[i + 1]
                    const diff = prev ? r.value - prev.value : null
                    return (
                      <tr key={r.date} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700">{r.date}</td>
                        <td className="px-4 py-2 text-right text-gray-900 font-medium">{fmtCard(r.value, meta?.unit ?? "")}</td>
                        <td className={`px-4 py-2 text-right font-medium text-sm ${cc(diff)}`}>
                          {diff == null ? "-" : `${diff > 0 ? "+" : ""}${fmtCard(diff, meta?.unit ?? "")}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!loading && chartData.length === 0 && (
        <p className="text-center text-gray-400 py-8">데이터가 없습니다.</p>
      )}
      </div>
    </AppLayout>
  )
}
