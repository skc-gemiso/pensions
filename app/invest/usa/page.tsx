"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import AppLayout from "@/components/AppLayout"
import { fmt } from "@/lib/fmt"
import { getCollectLogRecent, triggerUsaCollect, getUsaCollectStatusAction } from "./actions"

type CollectStatus = {
  running: boolean
  startedAt: string | null
  finishedAt: string | null
  success: boolean | null
  output: string
}

type LogEntry = {
  log_id: number
  collector_name: string
  target_name: string | null
  stat_date: string | null
  started_at: string | null
  finished_at: string | null
  status: string
  row_count: number | null
  message: string | null
}

function fmtDate(v: string | null): string {
  if (!v) return "—"
  const s = String(v)
  if (s.length >= 10 && s[4] === "-") return s.slice(0, 10)
  const d = new Date(v)
  if (isNaN(d.getTime())) return s.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
}

function fmtDateTime(v: string | null): string {
  if (!v) return "—"
  const d = new Date(v)
  if (isNaN(d.getTime())) return String(v).slice(0, 16)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
}

const COLLECTOR_LABELS: Record<string, string> = {
  fred:   "FRED 경제지표",
  fxrate: "원/달러 환율",
  tic:    "미국 국채(TIC)",
}

const TARGET_LABELS: Record<string, string> = {
  FEDFUNDS:     "미국 기준금리",
  GS10:         "미국 10년물 국채금리",
  GS30:         "미국 30년물 국채금리",
  MORTGAGE30US: "미국 모기지 금리",
  PAYEMS:       "미국 비농업고용지수(NFP)",
  PCEPI:        "미국 PCE 물가지수",
  UNRATE:       "미국 실업률",
  "USD/KRW":    "원/달러 환율",
  CHN:          "중국",
  JPN:          "일본",
}

export default function UsaCollectPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const isAdmin = role === "admin"

  const [status, setStatus]         = useState<CollectStatus | null>(null)
  const [logs, setLogs]             = useState<LogEntry[]>([])
  const [triggering, setTriggering] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const wasRunning = useRef(false)

  const fetchStatus = useCallback(async () => {
    const s = await getUsaCollectStatusAction()
    setStatus(s)
  }, [])

  const fetchLogs = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    const rows = await getCollectLogRecent()
    setLogs(rows)
    if (showSpinner) setRefreshing(false)
  }, [])

  useEffect(() => {
    fetchLogs()
    if (isAdmin) fetchStatus()
  }, [isAdmin, fetchStatus, fetchLogs])

  useEffect(() => {
    if (!status?.running) return
    const timer = setInterval(fetchStatus, 3000)
    return () => clearInterval(timer)
  }, [status?.running, fetchStatus])

  useEffect(() => {
    if (wasRunning.current && status && !status.running) fetchLogs()
    wasRunning.current = status?.running ?? false
  }, [status, fetchLogs])

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
      <p className="text-sm text-gray-500 mb-6">FRED 경제지표 및 미국 국채 보유 데이터 수집 현황</p>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
        <h3 className="font-semibold text-blue-800 mb-3">수집 안내</h3>
        <ul className="text-sm text-blue-700 space-y-1.5">
          <li>• <span className="font-medium">자동 수집</span>: 매주 월요일 09:00 자동 실행</li>
          <li>• <span className="font-medium">수집 대상</span>: FRED 경제지표 7종 (PCE 물가지수 · 비농업고용지수 · 실업률 · 10년물 국채금리 · 30년물 국채금리 · 모기지 금리 · 기준금리) · 미국 국채 보유(TIC: 일본·중국)</li>
          <li>• <span className="font-medium">수집 방법</span>: FRED Open API (경제지표) / 미국 재무부 TIC 공개 데이터 (국채 보유)</li>
          <li>• <span className="font-medium">환율 수집</span>: "원/달러 환율 조회" 메뉴에서 별도 관리</li>
        </ul>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={handleCollect}
            disabled={isRunning || triggering}
            className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-colors ${
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
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 text-sm">수집 이력 (최근 60건)</h3>
          <button
            onClick={() => fetchLogs(true)}
            disabled={refreshing}
            className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400 transition-colors"
          >
            {refreshing ? "로딩 중..." : "새로고침"}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {(["기준일", "수집기", "대상", "시작 시각", "완료 시각", "상태", "건수", "메모"] as const).map((h) => (
                  <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-700 ${h === "건수" ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">수집 이력이 없습니다.</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.log_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtDate(log.stat_date)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{COLLECTOR_LABELS[log.collector_name] ?? log.collector_name}</td>
                    <td className="px-4 py-3 text-gray-600">{log.target_name ? (TARGET_LABELS[log.target_name] ?? log.target_name) : "—"}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDateTime(log.started_at)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDateTime(log.finished_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        log.status === "success" ? "bg-green-100 text-green-700"
                        : log.status === "skipped" ? "bg-gray-100 text-gray-500"
                        : "bg-red-100 text-red-600"
                      }`}>
                        {log.status === "success" ? "성공" : log.status === "skipped" ? "스킵" : "오류"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{log.row_count != null ? fmt(log.row_count) : "—"}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">{log.message ?? ""}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </AppLayout>
  )
}
