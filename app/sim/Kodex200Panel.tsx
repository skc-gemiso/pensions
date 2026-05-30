"use client"

import { useEffect, useState } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"
import { fmt, cc } from "@/lib/fmt"
import { getKodex200Series, type Kodex200Row } from "./actions"

const PERIODS = [
  { label: "1년",  months: 12 },
  { label: "2년",  months: 24 },
  { label: "전체", months: undefined },
]

export function Kodex200Panel() {
  const [months, setMonths]   = useState<number | undefined>(12)
  const [rows, setRows]       = useState<Kodex200Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getKodex200Series(months).then((d) => { setRows(d); setLoading(false) })
  }, [months])

  const latest = rows[rows.length - 1]
  const avg    = rows.length > 0 ? rows.reduce((s, r) => s + r.amt, 0) / rows.length : null

  const chartData = rows.map((r) => ({ date: r.date, amt: r.amt }))
  const tableData = [...rows].reverse()

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-0.5">KODEX 200 주가</h2>
        <p className="text-xs text-gray-500">코스피200 추종 ETF 일별 주가 추이</p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-500">현재가</p>
          <p className="text-base font-bold text-gray-900 mt-0.5">{latest ? fmt(latest.amt) : "-"}</p>
          <p className="text-xs text-gray-400">{latest?.date ?? ""}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-500">전일 대비</p>
          <p className={`text-base font-bold mt-0.5 ${cc(latest?.e_amt ?? null)}`}>
            {latest ? `${latest.e_amt > 0 ? "+" : ""}${fmt(latest.e_amt)}` : "-"}
          </p>
          <p className="text-xs text-gray-400">원</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-500">등락률</p>
          <p className={`text-base font-bold mt-0.5 ${cc(latest?.e_rate ?? null)}`}>
            {latest ? `${latest.e_rate > 0 ? "+" : ""}${fmt(latest.e_rate / 100, 2)}%` : "-"}
          </p>
          <p className="text-xs text-gray-400">당일</p>
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
          {/* 차트 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 5, right: 14, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#374151" }}
                  tickFormatter={(v) => v.slice(0, 7)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#374151" }}
                  tickFormatter={(v) => Number(v).toLocaleString()}
                  domain={["auto", "auto"]}
                  width={68}
                />
                <Tooltip
                  formatter={(v: unknown) => [`${fmt(Number(v))} 원`, "종가"]}
                  labelFormatter={(l) => String(l)}
                  contentStyle={{ fontSize: 12, padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6 }}
                  labelStyle={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 2 }}
                  itemStyle={{ fontSize: 12, padding: "1px 0" }}
                />
                {avg != null && (
                  <ReferenceLine
                    y={avg}
                    stroke="#9ca3af"
                    strokeDasharray="4 2"
                    label={{ value: `평균 ${fmt(avg)}`, position: "insideTopRight", fontSize: 9, fill: "#9ca3af" }}
                  />
                )}
                <Line type="monotone" dataKey="amt" stroke="#2563eb" dot={false} strokeWidth={2} name="종가" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 테이블 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto max-h-[576px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {(["날짜", "종가", "전일 대비", "등락률", "거래량"] as const).map((h) => (
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
                  {tableData.map((r) => (
                    <tr key={r.date} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-1.5 text-right font-medium text-gray-900">{fmt(r.amt)}</td>
                      <td className={`px-3 py-1.5 text-right font-medium ${cc(r.e_amt)}`}>
                        {r.e_amt > 0 ? "+" : ""}{fmt(r.e_amt)}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-medium ${cc(r.e_rate)}`}>
                        {r.e_rate > 0 ? "+" : ""}{fmt(r.e_rate / 100, 2)}%
                      </td>
                      <td className="px-3 py-1.5 text-right text-gray-600">{fmt(r.e_trade)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
