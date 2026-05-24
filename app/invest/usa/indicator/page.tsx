"use client"

import { useEffect, useState } from "react"
import AppLayout from "@/components/AppLayout"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { getIndicatorList, getIndicatorSeries } from "../actions"
import type { IndicatorMeta } from "../actions"

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

function fmt(n: number | null | undefined, dec = 2) {
  if (n == null) return "-"
  return Number(n).toLocaleString("ko-KR", { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export default function IndicatorPage() {
  const [indicators, setIndicators] = useState<IndicatorMeta[]>([])
  const [code, setCode]             = useState<string>("")
  const [months, setMonths]         = useState<number | undefined>(24)
  const [series, setSeries]         = useState<{ stat_date: string; value: number }[]>([])
  const [loading, setLoading]       = useState(false)

  useEffect(() => {
    getIndicatorList().then((list) => {
      setIndicators(list)
      if (list.length > 0) setCode(list[0].indicator_code)
    })
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
      <h1 className="text-xl font-bold text-gray-900 mb-1">경제 지표 시계열</h1>
      <p className="text-sm text-gray-500 mb-4">FRED 지표별 시계열 추이를 확인합니다.</p>

      <div className="flex flex-wrap gap-3 mb-5">
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
      </div>

      {meta && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-gray-900">{meta.indicator_name}</p>
            <span className="text-xs text-gray-400">{meta.unit}</span>
            {meta.description && <span className="text-xs text-gray-500">{meta.description}</span>}
          </div>
          {INDICATOR_LINKS[code] && (
            <a
              href={INDICATOR_LINKS[code]}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              최신 자료 보기
            </a>
          )}
        </div>
      )}

      {loading && <p className="text-center text-gray-400 py-8">로딩 중...</p>}

      {!loading && chartData.length > 0 && (
        <div className="space-y-4">
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
                    {["날짜", "값", "전기 대비"].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-gray-700 font-medium">{h}</th>
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
                        <td className="px-4 py-2 text-gray-900 font-medium">{fmt(r.value)}</td>
                        <td className={`px-4 py-2 font-medium text-sm ${diff == null ? "" : diff > 0 ? "text-red-600" : diff < 0 ? "text-blue-600" : "text-gray-500"}`}>
                          {diff == null ? "-" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}
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
