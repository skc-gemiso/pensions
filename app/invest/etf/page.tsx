"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import AppLayout from "@/components/AppLayout"
import { getFetchLog, triggerCollect, getCollectStatusAction } from "./actions"

type CollectStatus = {
  running: boolean
  startedAt: string | null
  finishedAt: string | null
  success: boolean | null
  output: string
}

type LogEntry = {
  etf_ticker: string
  holding_date: string
  fetched_at: string
  status: string
  row_count: number | null
  error_msg: string | null
}

export default function EtfCollectPage() {
  const [status, setStatus] = useState<CollectStatus | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [triggering, setTriggering] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const wasRunning = useRef(false)

  const fetchStatus = useCallback(async () => {
    const s = await getCollectStatusAction()
    setStatus(s)
  }, [])

  const fetchLogs = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    const rows = await getFetchLog()
    setLogs(rows)
    if (showSpinner) setRefreshing(false)
  }, [])

  useEffect(() => {
    fetchStatus()
    fetchLogs()
  }, [fetchStatus, fetchLogs])

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
      await triggerCollect()
      await fetchStatus()
    } finally {
      setTriggering(false)
    }
  }

  const isRunning = status?.running ?? false
  const btnDisabled = isRunning || triggering

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">글로벌 ETF 데이터 수집</h1>
      <p className="text-sm text-gray-500 mb-6">BlackRock ETF 보유 종목 데이터 수집 현황을 확인합니다.</p>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
        <h3 className="font-semibold text-blue-800 mb-3">수집 안내</h3>
        <ul className="text-sm text-blue-700 space-y-1.5">
          <li>• <span className="font-medium">자동 수집</span>: 매일 오전 09:00 자동 실행</li>
          <li>• <span className="font-medium">수동 수집</span>: 아래 버튼으로 즉시 실행 (약 2~5분 소요)</li>
          <li>• <span className="font-medium">저장 조건</span>: holding_date가 DB에 없는 신규 날짜인 경우만 저장</li>
          <li>• <span className="font-medium">대상 ETF</span>: IEMG · EEM · EWY (BlackRock iShares)</li>
        </ul>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={handleCollect}
          disabled={btnDisabled}
          className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-colors ${
            isRunning
              ? "bg-yellow-100 text-yellow-700 cursor-not-allowed"
              : btnDisabled
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {isRunning ? "수집 중..." : "ETF 데이터 수집 실행"}
        </button>
        {isRunning && (
          <span className="text-sm text-yellow-700">Playwright 브라우저로 iShares에서 데이터를 가져오는 중...</span>
        )}
        {!isRunning && status?.finishedAt && (
          <span className={`text-sm ${status.success ? "text-green-600" : "text-red-500"}`}>
            마지막 실행: {new Date(status.finishedAt).toLocaleString("ko-KR")} — {status.success ? "성공" : "실패"}
          </span>
        )}
      </div>

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
                {["ETF", "기준일", "수집 시각", "상태", "종목 수", "메모"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">수집 이력이 없습니다.</td></tr>
              ) : (
                logs.map((log, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{log.etf_ticker}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {new Date(log.holding_date).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" })}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(log.fetched_at).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        log.status === "success" ? "bg-green-100 text-green-700"
                        : log.status === "skipped" ? "bg-gray-100 text-gray-500"
                        : "bg-red-100 text-red-600"
                      }`}>
                        {log.status === "success" ? "성공" : log.status === "skipped" ? "스킵" : "오류"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{log.row_count != null ? log.row_count.toLocaleString() : "—"}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{log.error_msg ?? ""}</td>
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
