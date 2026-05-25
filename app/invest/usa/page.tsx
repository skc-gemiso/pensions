"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import AppLayout from "@/components/AppLayout"
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from "recharts"
import { getIndicatorLatest, getCollectLastRun, triggerUsaCollect, getUsaCollectStatusAction } from "./actions"
import type { IndicatorCard } from "./actions"

type CollectStatus = {
  running: boolean
  startedAt: string | null
  finishedAt: string | null
  success: boolean | null
  output: string
}

type LastRun = {
  collector_name: string
  last_run: string | null
  last_status: string | null
}

function fmt(n: number | null, unit: string): string {
  if (n == null) return "-"
  if (unit === "%" || unit === "%p") return `${Number(n).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
  if (unit === "십억 달러" || unit === "억 달러") return Number(n).toLocaleString("ko-KR", { maximumFractionDigits: 1 })
  return Number(n).toLocaleString("ko-KR", { maximumFractionDigits: 2 })
}

function ChangeChip({ current, prev }: { current: number | null; prev: number | null }) {
  if (current == null || prev == null) return null
  const diff = current - prev
  const isPos = diff > 0
  const isNeg = diff < 0
  const cls = isPos ? "text-red-600 bg-red-50" : isNeg ? "text-blue-600 bg-blue-50" : "text-gray-500 bg-gray-50"
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`} title="직전 기간 대비 변화량">
      전월 대비 {isPos ? "+" : ""}{Number(diff).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  )
}

const COLLECTOR_LABELS: Record<string, string> = {
  fred:   "미국 연방준비제도 경제 데이터 수집",
  fxrate: "원/달러 환율 수집",
  tic:    "미국 국채 금리 수집",
}

function SparkLine({ data, color, name, unit }: { data: { date: string; value: number }[]; color: string; name: string; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height={50}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }} barCategoryGap="15%">
        <XAxis dataKey="date" hide />
        <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        <Tooltip
          formatter={(v: unknown) => [fmt(Number(v), unit), name]}
          labelFormatter={(l) => {
            const s = String(l)
            if (s.length >= 7) return `${s.slice(0, 4)}년 ${parseInt(s.slice(5, 7))}월`
            return s
          }}
          contentStyle={{ fontSize: 12, padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6 }}
          labelStyle={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 2 }}
          itemStyle={{ fontSize: 12, padding: "1px 0" }}
          cursor={{ fill: "#f3f4f6" }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function UsaDashboardPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const isAdmin = role === "admin"

  const [cards, setCards]         = useState<IndicatorCard[]>([])
  const [loading, setLoading]     = useState(true)
  const [status, setStatus]       = useState<CollectStatus | null>(null)
  const [lastRuns, setLastRuns]   = useState<LastRun[]>([])
  const [triggering, setTriggering] = useState(false)
  const wasRunning = useRef(false)

  const fetchStatus = useCallback(async () => {
    const s = await getUsaCollectStatusAction()
    setStatus(s)
  }, [])

  const fetchLastRuns = useCallback(async () => {
    const rows = await getCollectLastRun()
    setLastRuns(rows)
  }, [])

  useEffect(() => {
    getIndicatorLatest().then((d) => { setCards(d); setLoading(false) })
    if (isAdmin) { fetchStatus(); fetchLastRuns() }
  }, [isAdmin, fetchStatus, fetchLastRuns])

  useEffect(() => {
    if (!status?.running) return
    const timer = setInterval(fetchStatus, 3000)
    return () => clearInterval(timer)
  }, [status?.running, fetchStatus])

  useEffect(() => {
    if (wasRunning.current && status && !status.running) {
      fetchLastRuns()
      getIndicatorLatest().then(setCards)
    }
    wasRunning.current = status?.running ?? false
  }, [status, fetchLastRuns])

  async function handleCollect() {
    setTriggering(true)
    try {
      await triggerUsaCollect()
      await fetchStatus()
    } finally {
      setTriggering(false)
    }
  }

  const isRunning = status?.running ?? false

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">미국 경제 지표 수집</h1>
      <p className="text-sm text-gray-500 mb-4">FRED 주요 경제 지표 최신값 및 추이</p>

      {/* Admin 수집 패널 */}
      {isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-blue-800 mb-3">수집 관리 (관리자)</h3>
          <ul className="text-sm text-blue-700 space-y-1 mb-4">
            <li>• <span className="font-medium">자동 수집</span>: 매주 월요일 09:00 자동 실행</li>
            <li>• <span className="font-medium">수집 대상</span>: FRED 경제지표 · 미국 국채 보유(TIC)</li>
            <li>• <span className="font-medium">환율 수집</span>: "원/달러 환율 조회" 메뉴에서 별도 관리</li>
          </ul>

          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={handleCollect}
              disabled={isRunning || triggering}
              className={`px-5 py-2 rounded-lg font-medium text-sm transition-colors ${
                isRunning
                  ? "bg-yellow-100 text-yellow-700 cursor-not-allowed"
                  : triggering
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {isRunning ? "수집 중..." : "미국 경제지표 수집 실행"}
            </button>
            {isRunning && (
              <span className="text-sm text-yellow-700">FRED API 데이터를 수집 중입니다...</span>
            )}
            {!isRunning && status?.finishedAt && (
              <span className={`text-sm ${status.success ? "text-green-600" : "text-red-500"}`}>
                마지막 실행: {new Date(status.finishedAt).toLocaleString("ko-KR")} — {status.success ? "성공" : "실패"}
              </span>
            )}
          </div>

          {lastRuns.length > 0 && (
            <table className="w-full text-sm bg-white rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  {["수집기", "마지막 실행", "상태"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lastRuns.map((r) => (
                  <tr key={r.collector_name}>
                    <td className="px-3 py-2 font-medium text-gray-800">{COLLECTOR_LABELS[r.collector_name] ?? r.collector_name}</td>
                    <td className="px-3 py-2 text-gray-500">
                      {r.last_run ? new Date(r.last_run).toLocaleString("ko-KR") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.last_status ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.last_status === "success" ? "bg-green-100 text-green-700"
                          : r.last_status === "skipped" ? "bg-gray-100 text-gray-500"
                          : "bg-red-100 text-red-600"
                        }`}>
                          {r.last_status === "success" ? "성공" : r.last_status === "skipped" ? "스킵" : r.last_status}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {loading && <p className="text-center text-gray-400 py-8">로딩 중...</p>}

      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map((c) => {
            const sparkColor = c.latest_value == null || c.prev_value == null
              ? "#6b7280"
              : c.latest_value >= c.prev_value ? "#ef4444" : "#3b82f6"
            return (
              <div key={c.indicator_code} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{c.indicator_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{c.indicator_code}</p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 mt-0.5">{c.unit}</span>
                </div>

                <SparkLine data={c.spark} color={sparkColor} name={c.indicator_name} unit={c.unit} />

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{fmt(c.latest_value, c.unit)}</p>
                    {c.latest_date && (
                      <p className="text-xs text-gray-400 mt-0.5">{c.latest_date.slice(0, 10)}</p>
                    )}
                  </div>
                  <ChangeChip current={c.latest_value} prev={c.prev_value} />
                </div>

                {c.description && (
                  <p className="text-xs text-gray-500 border-t border-gray-100 pt-2">{c.description}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
      </div>
    </AppLayout>
  )
}
