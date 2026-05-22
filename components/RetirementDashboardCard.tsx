"use client"

import { useMemo } from "react"
import Link from "next/link"

const JOIN_DATE   = new Date(2015, 1, 23) // 2015-02-23
const RETIRE_DATE = new Date(2034, 1, 23) // 2034-02-23 (정년)

// 2034 정년 기준 고정값
const RETIRE_2034_NET_MAN = 16_700
const TDF_ANNUAL_MAN      = Math.round(RETIRE_2034_NET_MAN * 0.30 * 0.05)
const TOTAL_MONTHLY       = Math.round((RETIRE_2034_NET_MAN * 0.70 * 0.15 + TDF_ANNUAL_MAN) / 12)
const AFTER_TAX_MONTHLY   = Math.round(TOTAL_MONTHLY * (1 - 0.055))

function fmtMan(man: number): string {
  if (man >= 10_000) {
    const ok  = Math.floor(man / 10_000)
    const rem = man % 10_000
    return rem === 0 ? `${ok}억원` : `${ok}억 ${rem.toLocaleString()}만원`
  }
  return `${man.toLocaleString()}만원`
}

export function RetirementNavCard() {
  const today = useMemo(() => new Date(), [])

  const { totalDays, retireTotalDays, years, months } = useMemo(() => {
    const totalDays       = Math.floor((today.getTime()       - JOIN_DATE.getTime())  / 86_400_000)
    const retireTotalDays = Math.floor((RETIRE_DATE.getTime() - JOIN_DATE.getTime())  / 86_400_000)
    let yy = today.getFullYear() - JOIN_DATE.getFullYear()
    let mm = today.getMonth()    - JOIN_DATE.getMonth()
    if (mm < 0) { yy--; mm += 12 }
    if (today.getDate() < JOIN_DATE.getDate()) mm--
    if (mm < 0) { yy--; mm += 12 }
    return { totalDays, retireTotalDays, years: yy, months: mm }
  }, [today])

  const currentGrossMan = useMemo(
    () => Math.round(6_900_000 * (totalDays / 365) / 10_000),
    [totalDays]
  )
  const progressPct = Math.min(100, Math.round(totalDays / retireTotalDays * 100))

  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-5">
      <div className="flex items-start gap-3">
        <span className="text-2xl">🏢</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center mb-1">
            <h2 className="font-bold text-lg text-green-600">퇴직연금</h2>
            <Link
              href="/pension/ret"
              className="ml-auto flex items-center justify-center w-7 h-7 rounded-full bg-green-100 hover:bg-green-200 text-green-600 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <p className="text-sm text-gray-600 mb-4">퇴직 시점별 예상 수령액 · IRP 운용 시뮬레이션</p>

          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                퇴직연금 적립금
                <span className="ml-1 text-gray-400">({years}년 {months}개월)</span>
              </span>
              <span className="text-base font-bold text-gray-800">약 {fmtMan(currentGrossMan)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">정년(2034) 실수령</span>
              <span className="text-base font-bold text-gray-800">1억 6,700만원</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">IRP 퇴직연금 (월, 세후)</span>
              <span className="text-base font-bold text-emerald-700">약 {AFTER_TAX_MONTHLY.toLocaleString()}만원</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>근속 진행</span>
              <span className="text-green-600 font-medium">{progressPct}% (정년 2034.02)</span>
            </div>
            <div className="w-full bg-green-100 rounded-full h-1.5">
              <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
