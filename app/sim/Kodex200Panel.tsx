"use client"

import { useEffect, useState } from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts"
import { fmt, cc } from "@/lib/fmt"
import { getKodex200Series, getCoveredCallSeries, type Kodex200Row, type CoveredCallRow } from "./actions"

const PERIODS = [
  { label: "1년",  months: 12 },
  { label: "2년",  months: 24 },
  { label: "전체", months: undefined },
]

type ChartRow = { date: string; kodex: number | null; cc: number | null }

export function Kodex200Panel() {
  const [months, setMonths]     = useState<number | undefined>(12)
  const [rows, setRows]         = useState<Kodex200Row[]>([])
  const [ccRows, setCcRows]     = useState<CoveredCallRow[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getKodex200Series(months),
      getCoveredCallSeries(months),
    ]).then(([k, c]) => {
      setRows(k)
      setCcRows(c)
      setLoading(false)
    })
  }, [months])

  const latestK  = rows[rows.length - 1]
  const latestCC = ccRows[ccRows.length - 1]
  const prevCC   = ccRows[ccRows.length - 2]

  const ccChange     = (latestCC && prevCC) ? latestCC.amt - prevCC.amt : null
  const ccChangeRate = (ccChange != null && prevCC?.amt) ? (ccChange / prevCC.amt) * 100 : null

  // 날짜 기준으로 두 시리즈 병합
  const ccMap = new Map(ccRows.map((r) => [r.date, r.amt]))
  const chartData: ChartRow[] = rows.map((r) => ({
    date:  r.date,
    kodex: r.amt,
    cc:    ccMap.get(r.date) ?? null,
  }))

  // 테이블: KODEX 200 기준 최신순, 커버드콜 날짜 일치 시 병합
  const tableData = [...rows].reverse()

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-0.5">KODEX 200 (069500) · KODEX 200타겟위클리커버드콜 (498400)</h2>
      </div>

      {/* 요약 카드 — KODEX 200 */}
      <div>
        <p className="text-xs font-semibold text-blue-600 mb-1.5">KODEX 200 (069500)</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">현재가</p>
            <p className="text-base font-bold text-gray-900 mt-0.5">{latestK ? fmt(latestK.amt) : "-"}</p>
            <p className="text-xs text-gray-400">{latestK?.date ?? ""}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">전일 대비</p>
            <p className={`text-base font-bold mt-0.5 ${cc(latestK?.e_amt ?? null)}`}>
              {latestK ? `${latestK.e_amt > 0 ? "+" : ""}${fmt(latestK.e_amt)}` : "-"}
            </p>
            <p className="text-xs text-gray-400">원</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">등락률</p>
            <p className={`text-base font-bold mt-0.5 ${cc(latestK?.e_rate ?? null)}`}>
              {latestK ? `${latestK.e_rate > 0 ? "+" : ""}${fmt(latestK.e_rate, 2)}%` : "-"}
            </p>
            <p className="text-xs text-gray-400">당일</p>
          </div>
        </div>
      </div>

      {/* 요약 카드 — 커버드콜 */}
      <div>
        <p className="text-xs font-semibold text-amber-600 mb-1.5">KODEX 200타겟위클리커버드콜 (498400)</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">현재가</p>
            <p className="text-base font-bold text-gray-900 mt-0.5">{latestCC ? fmt(latestCC.amt) : "-"}</p>
            <p className="text-xs text-gray-400">{latestCC?.date ?? "데이터 없음"}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">전일 대비</p>
            <p className={`text-base font-bold mt-0.5 ${cc(ccChange)}`}>
              {ccChange != null ? `${ccChange > 0 ? "+" : ""}${fmt(ccChange)}` : "-"}
            </p>
            <p className="text-xs text-gray-400">원</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">등락률</p>
            <p className={`text-base font-bold mt-0.5 ${cc(ccChangeRate)}`}>
              {ccChangeRate != null ? `${ccChangeRate > 0 ? "+" : ""}${fmt(ccChangeRate, 2)}%` : "-"}
            </p>
            <p className="text-xs text-gray-400">당일</p>
          </div>
        </div>
      </div>

      {/* 기간 선택 */}
      <div className="flex gap-1">
        {PERIODS.map((p) => (
          <button
            key={p.label}
            onClick={() => setMonths(p.months)}
            className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors ${
              months === p.months
                ? "bg-blue-600 text-white border-blue-600"
                : "border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-center text-gray-400 py-4 text-sm">로딩 중...</p>}

      {!loading && chartData.length > 0 && (
        <>
          {/* 이중 축 차트 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 5, right: 68, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#374151" }}
                  tickFormatter={(v) => v.slice(0, 7)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: "#374151" }}
                  tickFormatter={(v) => Number(v).toLocaleString()}
                  domain={["auto", "auto"]}
                  width={68}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: "#d97706" }}
                  tickFormatter={(v) => Number(v).toLocaleString()}
                  domain={["auto", "auto"]}
                  width={68}
                />
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [`${fmt(Number(v))} 원`, String(name ?? "")]}
                  labelFormatter={(l) => String(l)}
                  contentStyle={{ fontSize: 12, padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6 }}
                  labelStyle={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 2 }}
                  itemStyle={{ fontSize: 12, padding: "1px 0" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="kodex"
                  stroke="#2563eb"
                  dot={false}
                  strokeWidth={2}
                  name="KODEX 200"
                  connectNulls
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cc"
                  stroke="#d97706"
                  dot={false}
                  strokeWidth={2}
                  name="커버드콜 (498400)"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 테이블 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto max-h-[576px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-700 text-left">날짜</th>
                    <th className="px-3 py-2 text-xs font-semibold text-blue-700 text-right">KODEX200 종가</th>
                    <th className="px-3 py-2 text-xs font-semibold text-blue-700 text-right">전일 대비</th>
                    <th className="px-3 py-2 text-xs font-semibold text-blue-700 text-right">등락률</th>
                    <th className="px-3 py-2 text-xs font-semibold text-amber-700 text-right">커버드콜 종가</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-700 text-right">거래량</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tableData.map((r) => {
                    const ccAmt = ccMap.get(r.date) ?? null
                    return (
                      <tr key={r.date} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{r.date}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-gray-900">{fmt(r.amt)}</td>
                        <td className={`px-3 py-1.5 text-right font-medium ${cc(r.e_amt)}`}>
                          {r.e_amt > 0 ? "+" : ""}{fmt(r.e_amt)}
                        </td>
                        <td className={`px-3 py-1.5 text-right font-medium ${cc(r.e_rate)}`}>
                          {r.e_rate > 0 ? "+" : ""}{fmt(r.e_rate, 2)}%
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium text-amber-700">
                          {ccAmt != null ? fmt(ccAmt) : "-"}
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{fmt(r.e_trade)}</td>
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
  )
}
