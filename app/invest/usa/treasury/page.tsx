"use client"

import { useEffect, useState } from "react"
import AppLayout from "@/components/AppLayout"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { getTreasurySeries } from "../actions"

const PERIODS = [
  { label: "1년",  months: 12  },
  { label: "2년",  months: 24  },
  { label: "5년",  months: 60  },
  { label: "전체", months: undefined },
]

type Row = {
  stat_date: string
  country_code: string
  country_name: string
  amount_usd_billion: number
  fx_rate: number | null
  amount_krw_trillion: number | null
}

type ChartPoint = {
  date: string
  japan?: number
  china?: number
}

function fmtUsd(v: number | null | undefined) {
  if (v == null) return "-"
  return Number(v).toLocaleString("ko-KR", { maximumFractionDigits: 1 })
}
function fmtKrw(v: number | null | undefined) {
  if (v == null) return "-"
  return Number(v).toLocaleString("ko-KR", { maximumFractionDigits: 1 })
}

export default function TreasuryPage() {
  const [months, setMonths]   = useState<number | undefined>(24)
  const [unit, setUnit]       = useState<"usd" | "krw">("usd")
  const [rows, setRows]       = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getTreasurySeries(months).then((d) => { setRows(d); setLoading(false) })
  }, [months])

  // Pivot for chart
  const dateMap = new Map<string, ChartPoint>()
  for (const r of rows) {
    const d = r.stat_date.slice(0, 10)
    if (!dateMap.has(d)) dateMap.set(d, { date: d })
    const pt = dateMap.get(d)!
    const val = unit === "usd" ? r.amount_usd_billion : (r.amount_krw_trillion ?? null)
    if (r.country_code === "JPN") pt.japan = val ?? undefined
    if (r.country_code === "CHN") pt.china = val ?? undefined
  }
  const chartData = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date))

  const unitLabel = unit === "usd" ? "십억 달러" : "조 원"
  const lastPt    = chartData[chartData.length - 1]

  // Table: pivot by date with both countries per row
  type TableRow = { date: string; jpnUsd: number | null; jpnKrw: number | null; chnUsd: number | null; chnKrw: number | null }
  const tableMap = new Map<string, TableRow>()
  for (const r of rows) {
    const d = r.stat_date.slice(0, 10)
    if (!tableMap.has(d)) tableMap.set(d, { date: d, jpnUsd: null, jpnKrw: null, chnUsd: null, chnKrw: null })
    const tr = tableMap.get(d)!
    if (r.country_code === "JPN") { tr.jpnUsd = r.amount_usd_billion; tr.jpnKrw = r.amount_krw_trillion }
    if (r.country_code === "CHN") { tr.chnUsd = r.amount_usd_billion; tr.chnKrw = r.amount_krw_trillion }
  }
  const tableData = Array.from(tableMap.values()).sort((a, b) => b.date.localeCompare(a.date))

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">미국 국채 보유 현황</h1>
      <p className="text-sm text-gray-500 mb-4">일본·중국의 미국 국채 보유 추이 (TIC 데이터)</p>

      <div className="flex flex-wrap gap-3 mb-5">
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
        <button
          onClick={() => setUnit(unit === "usd" ? "krw" : "usd")}
          className={`px-4 py-2 text-sm rounded-lg border font-medium transition-colors ${
            unit === "krw"
              ? "bg-blue-600 text-white border-blue-600"
              : "border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
          }`}
        >
          차트: {unit === "usd" ? "USD" : "KRW"}
        </button>
      </div>

      {lastPt && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          {[
            { country: "일본", code: "JPN", key: "japan" as const, color: "text-blue-600" },
            { country: "중국", code: "CHN", key: "china" as const, color: "text-red-600" },
          ].map(({ country, code, key, color }) => {
            const last = rows.filter(r => r.country_code === code).slice(-1)[0]
            return (
              <div key={key} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">{country} 최근 보유액</p>
                <p className={`text-xl font-bold mt-1 ${color}`}>
                  {last ? `${fmtUsd(last.amount_usd_billion)} 십억달러` : "-"}
                </p>
                {last?.amount_krw_trillion != null && (
                  <p className="text-sm text-gray-600 mt-0.5">
                    ≈ {fmtKrw(last.amount_krw_trillion)} 조원
                    {last.fx_rate && <span className="text-xs text-gray-400 ml-1">({last.fx_rate.toLocaleString()} 원/달러)</span>}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">{last?.stat_date ?? ""}</p>
              </div>
            )
          })}
        </div>
      )}

      {loading && <p className="text-center text-gray-400 py-8">로딩 중...</p>}

      {!loading && chartData.length > 0 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-2">단위: {unitLabel}</p>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#374151" }}
                  tickFormatter={(v) => v.slice(0, 7)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#374151" }}
                  tickFormatter={(v) => Number(v).toLocaleString()}
                  width={80}
                />
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [
                    `${Number(v).toLocaleString("ko-KR", { maximumFractionDigits: 1 })} ${unitLabel}`,
                    String(name),
                  ]}
                  labelFormatter={(l) => String(l)}
                  contentStyle={{ fontSize: 12, padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6 }}
                  labelStyle={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 2 }}
                  itemStyle={{ fontSize: 12, padding: "1px 0" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="japan" stroke="#3b82f6" dot={false} strokeWidth={2} name="일본" connectNulls />
                <Line type="monotone" dataKey="china" stroke="#ef4444" dot={false} strokeWidth={2} name="중국" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-gray-700 font-medium" rowSpan={2}>날짜</th>
                    <th className="px-4 py-2 text-center text-blue-700 font-medium border-l border-gray-200" colSpan={2}>일본</th>
                    <th className="px-4 py-2 text-center text-red-700 font-medium border-l border-gray-200" colSpan={2}>중국</th>
                  </tr>
                  <tr>
                    <th className="px-4 py-2 text-right text-gray-600 font-medium border-l border-gray-200">USD(십억달러)</th>
                    <th className="px-4 py-2 text-right text-gray-600 font-medium">KRW(조원)</th>
                    <th className="px-4 py-2 text-right text-gray-600 font-medium border-l border-gray-200">USD(십억달러)</th>
                    <th className="px-4 py-2 text-right text-gray-600 font-medium">KRW(조원)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tableData.map((r) => (
                    <tr key={r.date} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-700">{r.date}</td>
                      <td className="px-4 py-2 text-right text-blue-700 font-medium border-l border-gray-100">{fmtUsd(r.jpnUsd)}</td>
                      <td className="px-4 py-2 text-right text-blue-600">{fmtKrw(r.jpnKrw)}</td>
                      <td className="px-4 py-2 text-right text-red-700 font-medium border-l border-gray-100">{fmtUsd(r.chnUsd)}</td>
                      <td className="px-4 py-2 text-right text-red-600">{fmtKrw(r.chnKrw)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      </div>
    </AppLayout>
  )
}
