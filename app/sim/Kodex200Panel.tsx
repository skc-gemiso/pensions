"use client"

import { useEffect, useState } from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts"
import { fmt, cc } from "@/lib/fmt"
import { getKodex200Series, getCoveredCallSeries, type Kodex200Row, type CoveredCallRow } from "./actions"

const PERIODS = [
  { label: "3개월", months: 3  },
  { label: "6개월", months: 6  },
  { label: "1년",   months: 12 },
  { label: "2년",   months: 24 },
  { label: "전체",  months: undefined },
]

const INVEST = 10_000_000  // 1,000만원 기준

type ChartRow = { date: string; kodex: number | null; cc: number | null }

const sign = (n: number) => n > 0 ? "+" : ""

export function Kodex200Panel() {
  const [months, setMonths]   = useState<number | undefined>(12)
  const [rows, setRows]       = useState<Kodex200Row[]>([])
  const [ccRows, setCcRows]   = useState<CoveredCallRow[]>([])
  const [loading, setLoading] = useState(true)

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
  const firstK   = rows[0]
  const firstCC  = ccRows[0]

  // 1,000만원 기준 기말금액·수익금액·수익률
  const periodMonths = (firstCC && latestCC)
    ? (new Date(latestCC.date).getTime() - new Date(firstCC.date).getTime()) / (1000 * 60 * 60 * 24 * 30.4375)
    : 0
  const divMultiplier = Math.pow(1 + 0.12 / 12, periodMonths)

  const calcResult = (initAmt: number | undefined, finalAmt: number | undefined, extra = 1) => {
    if (!initAmt || !finalAmt || initAmt <= 0) return null
    const endVal  = Math.round(INVEST * (finalAmt / initAmt) * extra)
    const profit  = endVal - INVEST
    const retPct  = (endVal / INVEST - 1) * 100
    return { endVal, profit, retPct }
  }

  const kResult     = calcResult(firstK?.amt,  latestK?.amt)
  const ccResult    = calcResult(firstCC?.amt, latestCC?.amt)
  const ccDivResult = calcResult(firstCC?.amt, latestCC?.amt, divMultiplier)

  // 차트 데이터
  const ccMap = new Map(ccRows.map((r) => [r.date, r]))
  const chartData: ChartRow[] = rows.map((r) => ({
    date:  r.date,
    kodex: r.amt,
    cc:    ccMap.get(r.date)?.amt ?? null,
  }))
  const tableData = [...rows].reverse()

  return (
    <div className="space-y-4">
      {/* 헤더 + 기간 선택 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-gray-900">
          KODEX 200 (069500) · KODEX 200타겟위클리커버드콜 (498400)
        </h2>
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
      </div>

      {/* 요약 카드 3개 — 25% / 25% / 50% */}
      <div className="grid grid-cols-4 gap-3">

        {/* KODEX 200 (25%) */}
        <div className="col-span-1 bg-white rounded-xl border border-blue-200 p-4">
          <p className="text-xs font-semibold text-blue-600 mb-3">KODEX 200 (069500)</p>
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-medium text-gray-600">현재가</span>
              <span className="text-base font-bold text-gray-900">{latestK ? `${fmt(latestK.amt)}원` : "-"}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-medium text-gray-600">전일 대비</span>
              <span className={`text-sm font-semibold ${cc(latestK?.e_amt ?? null)}`}>
                {latestK ? `${sign(latestK.e_amt)}${fmt(latestK.e_amt)}원` : "-"}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-medium text-gray-600">등락률</span>
              <span className={`text-sm font-semibold ${cc(latestK?.e_rate ?? null)}`}>
                {latestK ? `${sign(latestK.e_rate)}${fmt(latestK.e_rate, 2)}%` : "-"}
              </span>
            </div>
            <div className="border-t border-gray-100 pt-2 mt-1 space-y-1">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-400">기초 지수</span>
                <span className="text-xs text-gray-700">{firstK ? `${fmt(firstK.amt)}원` : "-"}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-400">기간 수익률</span>
                <span className={`text-xs font-medium ${cc(kResult?.retPct ?? null)}`}>
                  {kResult ? `${sign(kResult.retPct)}${fmt(kResult.retPct, 2)}%` : "-"}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-400 text-right">{latestK?.date ?? ""}</p>
          </div>
        </div>

        {/* 커버드콜 (25%) */}
        <div className="col-span-1 bg-white rounded-xl border border-amber-200 p-4">
          <p className="text-xs font-semibold text-amber-600 mb-3">KODEX 200타겟위클리커버드콜 (498400)</p>
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-medium text-gray-600">현재가</span>
              <span className="text-base font-bold text-gray-900">{latestCC ? `${fmt(latestCC.amt)}원` : "-"}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-medium text-gray-600">전일 대비</span>
              <span className={`text-sm font-semibold ${cc(latestCC?.e_amt ?? null)}`}>
                {latestCC ? `${sign(latestCC.e_amt)}${fmt(latestCC.e_amt)}원` : "-"}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-medium text-gray-600">등락률</span>
              <span className={`text-sm font-semibold ${cc(latestCC?.e_rate ?? null)}`}>
                {latestCC ? `${sign(latestCC.e_rate)}${fmt(latestCC.e_rate, 2)}%` : "-"}
              </span>
            </div>
            <div className="border-t border-gray-100 pt-2 mt-1 space-y-1">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-400">기초 지수</span>
                <span className="text-xs text-gray-700">{firstCC ? `${fmt(firstCC.amt)}원` : "-"}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-400">기간 수익률</span>
                <span className={`text-xs font-medium ${cc(ccResult?.retPct ?? null)}`}>
                  {ccResult ? `${sign(ccResult.retPct)}${fmt(ccResult.retPct, 2)}%` : "-"}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-400 text-right">{latestCC?.date ?? "데이터 없음"}</p>
          </div>
        </div>

        {/* 수익율 비교 (50%) */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-baseline justify-between mb-0.5">
            <p className="text-xs font-semibold text-gray-600">
              수익율 비교 ({PERIODS.find(p => p.months === months)?.label ?? "전체"})
            </p>
            <p className="text-xs text-gray-400">
              기초일 {firstK?.date ?? "-"} → 기말일 {latestK?.date ?? "-"}
            </p>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            기초 금액 <span className="font-semibold text-gray-700">1,000만원</span> 투자 기준
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="pb-1.5 text-left font-medium"></th>
                <th className="pb-1.5 text-right font-medium">기초 금액</th>
                <th className="pb-1.5 text-right font-medium">기초 지수</th>
                <th className="pb-1.5 text-right font-medium">기말금액</th>
                <th className="pb-1.5 text-right font-medium">수익금액</th>
                <th className="pb-1.5 text-right font-medium">수익률</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <tr>
                <td className="py-1.5 text-blue-600 font-medium">KODEX200</td>
                <td className="py-1.5 text-right text-gray-500">{fmt(INVEST)}원</td>
                <td className="py-1.5 text-right text-gray-700">{firstK ? `${fmt(firstK.amt)}원` : "-"}</td>
                <td className="py-1.5 text-right text-gray-900 font-medium">{kResult ? `${fmt(kResult.endVal)}원` : "-"}</td>
                <td className={`py-1.5 text-right font-medium ${cc(kResult?.profit ?? null)}`}>
                  {kResult ? `${sign(kResult.profit)}${fmt(kResult.profit)}원` : "-"}
                </td>
                <td className={`py-1.5 text-right font-semibold ${cc(kResult?.retPct ?? null)}`}>
                  {kResult ? `${sign(kResult.retPct)}${fmt(kResult.retPct, 2)}%` : "-"}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-amber-600 font-medium">커버드콜</td>
                <td className="py-1.5 text-right text-gray-500">{fmt(INVEST)}원</td>
                <td className="py-1.5 text-right text-gray-700">{firstCC ? `${fmt(firstCC.amt)}원` : "-"}</td>
                <td className="py-1.5 text-right text-gray-900 font-medium">{ccResult ? `${fmt(ccResult.endVal)}원` : "-"}</td>
                <td className={`py-1.5 text-right font-medium ${cc(ccResult?.profit ?? null)}`}>
                  {ccResult ? `${sign(ccResult.profit)}${fmt(ccResult.profit)}원` : "-"}
                </td>
                <td className={`py-1.5 text-right font-semibold ${cc(ccResult?.retPct ?? null)}`}>
                  {ccResult ? `${sign(ccResult.retPct)}${fmt(ccResult.retPct, 2)}%` : "-"}
                </td>
              </tr>
              <tr className="bg-amber-50">
                <td className="py-1.5 text-amber-700 font-medium leading-tight">
                  커버드콜<br />
                  <span className="text-gray-400 font-normal">(연12% 재투자)</span>
                </td>
                <td className="py-1.5 text-right text-gray-500">{fmt(INVEST)}원</td>
                <td className="py-1.5 text-right text-gray-700">{firstCC ? `${fmt(firstCC.amt)}원` : "-"}</td>
                <td className="py-1.5 text-right text-gray-900 font-medium">{ccDivResult ? `${fmt(ccDivResult.endVal)}원` : "-"}</td>
                <td className={`py-1.5 text-right font-medium ${cc(ccDivResult?.profit ?? null)}`}>
                  {ccDivResult ? `${sign(ccDivResult.profit)}${fmt(ccDivResult.profit)}원` : "-"}
                </td>
                <td className={`py-1.5 text-right font-semibold ${cc(ccDivResult?.retPct ?? null)}`}>
                  {ccDivResult ? `${sign(ccDivResult.retPct)}${fmt(ccDivResult.retPct, 2)}%` : "-"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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
                <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: "#374151" }} tickFormatter={(v) => Number(v).toLocaleString()} domain={["auto", "auto"]} width={68} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#d97706" }} tickFormatter={(v) => Number(v).toLocaleString()} domain={["auto", "auto"]} width={68} />
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [`${fmt(Number(v))} 원`, String(name ?? "")]}
                  labelFormatter={(l) => String(l)}
                  contentStyle={{ fontSize: 12, padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6 }}
                  labelStyle={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 2 }}
                  itemStyle={{ fontSize: 12, padding: "1px 0" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="left"  type="monotone" dataKey="kodex" stroke="#2563eb" dot={false} strokeWidth={2} name="KODEX 200"        connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="cc"    stroke="#d97706" dot={false} strokeWidth={2} name="커버드콜 (498400)" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 통합 테이블 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto max-h-[576px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th rowSpan={2} className="px-3 py-2 text-xs font-semibold text-gray-700 text-left border-b border-r border-gray-200 align-middle">날짜</th>
                    <th colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-blue-700 text-center border-b border-r border-gray-200">KODEX 200 (069500)</th>
                    <th colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-amber-700 text-center border-b border-gray-200">커버드콜 (498400)</th>
                  </tr>
                  <tr>
                    {(["종가", "전일대비", "등락률", "종가", "전일대비", "등락률"] as const).map((h, i) => (
                      <th key={i} className={`px-3 py-1.5 text-xs font-semibold text-gray-600 text-right border-b border-gray-200 ${i === 2 ? "border-r" : ""}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tableData.map((r) => {
                    const ccRow = ccMap.get(r.date)
                    return (
                      <tr key={r.date} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap border-r border-gray-100">{r.date}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-gray-900">{fmt(r.amt)}</td>
                        <td className={`px-3 py-1.5 text-right font-medium ${cc(r.e_amt)}`}>{sign(r.e_amt)}{fmt(r.e_amt)}</td>
                        <td className={`px-3 py-1.5 text-right font-medium border-r border-gray-100 ${cc(r.e_rate)}`}>{sign(r.e_rate)}{fmt(r.e_rate, 2)}%</td>
                        <td className="px-3 py-1.5 text-right font-medium text-gray-900">{ccRow ? fmt(ccRow.amt) : "-"}</td>
                        <td className={`px-3 py-1.5 text-right font-medium ${cc(ccRow?.e_amt ?? null)}`}>{ccRow ? `${sign(ccRow.e_amt)}${fmt(ccRow.e_amt)}` : "-"}</td>
                        <td className={`px-3 py-1.5 text-right font-medium ${cc(ccRow?.e_rate ?? null)}`}>{ccRow ? `${sign(ccRow.e_rate)}${fmt(ccRow.e_rate, 2)}%` : "-"}</td>
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
