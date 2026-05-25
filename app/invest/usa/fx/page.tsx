"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import AppLayout from "@/components/AppLayout"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"
import { getFxSeries, triggerFxCollect, getFxCollectStatusAction } from "../actions"

const PERIODS = [
  { label: "1년",  months: 12  },
  { label: "2년",  months: 24  },
  { label: "5년",  months: 60  },
  { label: "전체", months: undefined },
]

type Point = { stat_date: string; exchange_rate: number }

function fmt(n: number | null, dec = 2) {
  if (n == null) return "-"
  return Number(n).toLocaleString("ko-KR", { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

type CollectStatus = { running: boolean; startedAt: string | null; finishedAt: string | null; success: boolean | null }

export default function FxPage() {
  const { data: session } = useSession()
  const isAdmin = (session?.user as { role?: string })?.role === "admin"

  const [months, setMonths]         = useState<number | undefined>(24)
  const [rows, setRows]             = useState<Point[]>([])
  const [loading, setLoading]       = useState(true)
  const [status, setStatus]         = useState<CollectStatus | null>(null)
  const [triggering, setTriggering] = useState(false)
  const wasRunning = useRef(false)

  const fetchStatus = useCallback(async () => {
    const s = await getFxCollectStatusAction()
    setStatus(s)
  }, [])

  const loadData = useCallback(() => {
    setLoading(true)
    getFxSeries(months).then((d) => { setRows(d); setLoading(false) })
  }, [months])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { if (isAdmin) fetchStatus() }, [isAdmin, fetchStatus])

  useEffect(() => {
    if (!status?.running) return
    const t = setInterval(fetchStatus, 3000)
    return () => clearInterval(t)
  }, [status?.running, fetchStatus])

  useEffect(() => {
    if (wasRunning.current && status && !status.running) loadData()
    wasRunning.current = status?.running ?? false
  }, [status, loadData])

  async function handleCollect() {
    setTriggering(true)
    try { await triggerFxCollect(); await fetchStatus() }
    finally { setTriggering(false) }
  }

  const chartData = rows.map((r) => ({ date: r.stat_date.slice(0, 10), rate: r.exchange_rate }))
  const latest    = chartData[chartData.length - 1]
  const prev      = chartData[chartData.length - 2]
  const diff      = latest && prev ? latest.rate - prev.rate : null
  const avg       = chartData.length > 0
    ? chartData.reduce((s, r) => s + r.rate, 0) / chartData.length
    : null

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">원/달러 환율 조회</h1>
      <p className="text-sm text-gray-500 mb-4">일별 원/달러 환율 추이</p>

      {isAdmin && (
        <div className="flex items-center gap-4 mb-5 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <button
            onClick={handleCollect}
            disabled={status?.running || triggering}
            className={`px-5 py-2 rounded-lg font-medium text-sm transition-colors ${
              status?.running ? "bg-yellow-100 text-yellow-700 cursor-not-allowed"
              : triggering ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {status?.running ? "수집 중..." : "환율 수동 수집"}
          </button>
          <p className="text-xs text-blue-700">
            {status?.running
              ? "Frankfurter API에서 환율 데이터를 수집 중입니다..."
              : status?.finishedAt
              ? `마지막 수집: ${new Date(status.finishedAt).toLocaleString("ko-KR")} — ${status.success ? "성공" : "실패"}`
              : "자동: 매일 09:00 KST"}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-5">
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

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">최근 환율</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {latest ? fmt(latest.rate) : "-"}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{latest?.date ?? ""}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">전일 대비</p>
          <p className={`text-2xl font-bold mt-1 ${diff == null ? "text-gray-900" : diff > 0 ? "text-red-600" : "text-blue-600"}`}>
            {diff == null ? "-" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">원</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">기간 평균</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{avg != null ? fmt(avg) : "-"}</p>
          <p className="text-xs text-gray-400 mt-0.5">원</p>
        </div>
      </div>

      {loading && <p className="text-center text-gray-400 py-8">로딩 중...</p>}

      {!loading && chartData.length > 0 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <ResponsiveContainer width="100%" height={300}>
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
                  domain={["auto", "auto"]}
                  width={70}
                />
                <Tooltip
                  formatter={(v: unknown) => [`${fmt(Number(v))} 원`, "USD/KRW"]}
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
                    label={{ value: `평균 ${fmt(avg)}`, position: "right", fontSize: 10, fill: "#9ca3af" }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="#f59e0b"
                  dot={false}
                  strokeWidth={2}
                  name="USD/KRW"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {["날짜", "환율 (원)", "전일 대비"].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-gray-700 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...chartData].reverse().map((r, i, arr) => {
                    const prevRow = arr[i + 1]
                    const d = prevRow ? r.rate - prevRow.rate : null
                    return (
                      <tr key={r.date} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700">{r.date}</td>
                        <td className="px-4 py-2 text-gray-900 font-medium">{fmt(r.rate)}</td>
                        <td className={`px-4 py-2 font-medium ${d == null ? "" : d > 0 ? "text-red-600" : d < 0 ? "text-blue-600" : "text-gray-500"}`}>
                          {d == null ? "-" : `${d > 0 ? "+" : ""}${fmt(d)}`}
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
      </div>
    </AppLayout>
  )
}
