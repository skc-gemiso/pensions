"use client"

import { useMemo } from "react"
import Link from "next/link"

const NP_START_DATE        = new Date(2007, 10, 1)
const PENSION_START        = new Date(2039, 6,  1)
const TOTAL_MONTHS         = 319
const LATEST_NET_WON       = 1_311_130
const LATEST_TOTAL_PREMIUM = 144_142_920

function fmtPremium(n: number): string {
  const ok  = Math.floor(n / 100_000_000)
  const rem = Math.floor((n % 100_000_000) / 10_000)
  return rem > 0 ? `${ok}억 ${rem.toLocaleString()}만원` : `${ok}억원`
}

function monthsBetween(from: Date, to: Date) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}

function yearMonthDiff(from: Date, to: Date) {
  let years = to.getFullYear() - from.getFullYear()
  let months = to.getMonth() - from.getMonth()
  if (months < 0) { years--; months += 12 }
  return { years, months }
}

function NavIcon({ href, color }: { href: string; color: string }) {
  return (
    <Link
      href={href}
      className={`ml-auto flex items-center justify-center w-7 h-7 rounded-full ${color} transition-colors`}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}

export function NationalPensionNavCard() {
  const today       = useMemo(() => new Date(), [])
  const paidMonths  = useMemo(() => Math.max(0, Math.min(TOTAL_MONTHS, monthsBetween(NP_START_DATE, today))), [today])
  const progressPct = Math.round(paidMonths / TOTAL_MONTHS * 100)
  const toPension   = useMemo(() => yearMonthDiff(today, PENSION_START), [today])

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
      <div className="flex items-start gap-3">
        <span className="text-2xl">🏛️</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center mb-1">
            <h2 className="font-bold text-lg text-blue-600">국민연금</h2>
            <NavIcon href="/pension/nat" color="bg-blue-100 hover:bg-blue-200 text-blue-500" />
          </div>
          <p className="text-sm text-gray-600 mb-4">납부 현황 및 예상 수령액</p>

          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">국민연금 적립금</span>
              <span className="text-base font-bold text-gray-800">{fmtPremium(LATEST_TOTAL_PREMIUM)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">국민연금 (월, 세후)</span>
              <span className="text-base font-bold text-blue-700">{LATEST_NET_WON.toLocaleString()}원</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">연금 개시까지</span>
              <span className="text-base font-bold text-amber-600">
                {toPension.years}년 {toPension.months}개월
                <span className="text-sm text-gray-400 font-normal ml-1">(2039.07)</span>
              </span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>납부 진행</span>
              <span className="text-blue-500 font-medium">{paidMonths} / {TOTAL_MONTHS}개월 ({progressPct}%)</span>
            </div>
            <div className="w-full bg-blue-100 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
