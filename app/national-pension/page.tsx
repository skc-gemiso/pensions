"use client"

import { useMemo } from "react"
import AppLayout from "@/components/AppLayout"

const NP_START_DATE   = new Date(2007, 10, 1)  // 2007년 11월
const NP_END_DATE     = new Date(2034, 5,  1)  // 2034년 06월 (만 60세)
const PENSION_START   = new Date(2039, 6,  1)  // 2039년 07월 (만 65세)
const TOTAL_MONTHS    = 319

// 국민연금공단 조회 이력
const SNAPSHOTS = [
  { date: "2026.05.05", totalPremium: 144_142_920, monthlyNet: 1_311_130, monthlyGross: 1_347_020 },
  { date: "2025.02.15", totalPremium: 126_911_400, monthlyNet: 1_246_810, monthlyGross: null       },
  { date: "2023.05.25", totalPremium: 116_053_080, monthlyNet: 1_106_830, monthlyGross: null       },
] as const

const LATEST = SNAPSHOTS[0]

function fmtWon(n: number) { return n.toLocaleString() + "원" }

function monthsBetween(from: Date, to: Date) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}

function yearMonthDiff(from: Date, to: Date) {
  let years = to.getFullYear() - from.getFullYear()
  let months = to.getMonth() - from.getMonth()
  if (months < 0) { years--; months += 12 }
  return { years, months }
}

export default function NationalPensionPage() {
  const today = useMemo(() => new Date(), [])

  const paidMonths  = useMemo(() => Math.max(0, Math.min(TOTAL_MONTHS, monthsBetween(NP_START_DATE, today))), [today])
  const progressPct = Math.round(paidMonths / TOTAL_MONTHS * 100)

  const toEnd     = useMemo(() => yearMonthDiff(today, NP_END_DATE),   [today])
  const toPension = useMemo(() => yearMonthDiff(today, PENSION_START),  [today])

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-5">

        {/* 헤더 */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">국민연금</h1>
          <p className="text-gray-500 text-sm">납부 현황 및 예상 수령액</p>
        </div>

        {/* 기본 정보 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">예상 납부 기간</p>
            <p className="text-lg font-bold text-gray-800">{TOTAL_MONTHS}개월</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">납부 기한</p>
            <p className="text-lg font-bold text-gray-800">2034년 06월</p>
            <p className="text-[11px] text-gray-400 mt-0.5">만 60세</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">연금 개시 예정</p>
            <p className="text-lg font-bold text-gray-800">2039년 07월</p>
            <p className="text-[11px] text-gray-400 mt-0.5">만 65세</p>
          </div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
            <p className="text-xs text-blue-400 mb-1">예상 월 수령액 (세후)</p>
            <p className="text-lg font-bold text-blue-700">{LATEST.monthlyNet.toLocaleString()}원</p>
            <p className="text-[11px] text-blue-300 mt-0.5">{LATEST.date} 기준</p>
          </div>
        </div>

        {/* 납부 진행 바 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>납부 시작 2007.11</span>
            <span className="font-medium text-blue-600">{paidMonths}개월 납부 ({progressPct}%)</span>
            <span>납부 완료 2034.06</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-400 h-3 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-300 mt-1">
            <span>2007</span>
            <span className="text-blue-400 font-medium">{today.getFullYear()}</span>
            <span>2034</span>
          </div>
        </div>

        {/* 남은 기간 카드 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">납부 완료까지</p>
            <p className="text-lg font-bold text-gray-800">{toEnd.years}년 {toEnd.months}개월</p>
            <p className="text-[11px] text-gray-400 mt-0.5">잔여 {TOTAL_MONTHS - paidMonths}개월</p>
          </div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
            <p className="text-xs text-amber-500 mb-1">연금 개시까지</p>
            <p className="text-lg font-bold text-amber-700">{toPension.years}년 {toPension.months}개월</p>
            <p className="text-[11px] text-amber-400 mt-0.5">2039년 07월부터 수령</p>
          </div>
        </div>

        {/* 예상 수령액 확인 이력 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">예상 수령액 확인 이력</h2>
            <p className="text-xs text-gray-400 mt-0.5">국민연금공단 내 연금 조회 기준 · 납부 완료 시점(2034.06) 기준 추정액</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                  <th className="px-4 py-3 text-left font-medium">확인 시점</th>
                  <th className="px-4 py-3 text-right font-medium">총 납부액</th>
                  <th className="px-4 py-3 text-right font-medium">월 수령 예상 (세후)</th>
                  <th className="px-4 py-3 text-right font-medium">월 수령 예상 (세전)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {SNAPSHOTS.map((s, i) => (
                  <tr key={s.date} className={i === 0 ? "bg-blue-50" : "hover:bg-gray-50"}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-700">{s.date}</span>
                        {i === 0 && (
                          <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">최신</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{fmtWon(s.totalPremium)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700">{fmtWon(s.monthlyNet)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {s.monthlyGross ? fmtWon(s.monthlyGross) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 납부액 증가 추이 요약 */}
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 flex gap-6">
            <span>납부액 증가: <span className="text-gray-600 font-medium">+{(SNAPSHOTS[0].totalPremium - SNAPSHOTS[2].totalPremium).toLocaleString()}원</span> (약 3년)</span>
            <span>수령액 증가: <span className="text-blue-600 font-medium">+{(SNAPSHOTS[0].monthlyNet - SNAPSHOTS[2].monthlyNet).toLocaleString()}원/월</span> (약 3년)</span>
          </div>
        </div>

        {/* 안내 */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 space-y-1.5">
          <p className="font-medium text-gray-600 mb-2">안내</p>
          <p>• 예상 수령액은 현재 소득 수준이 납부 완료(2034.06)까지 유지된다는 가정 하의 추정치입니다</p>
          <p>• 향후 제도 변경, 소득 변동, 크레딧 적용 등에 따라 실제 수령액이 달라질 수 있습니다</p>
          <p>• 세전 금액은 건강보험료 등 공제 전 기준이며, 세후는 공제 후 실수령 기준입니다</p>
          <p>• 연금 개시 연령(65세)은 1969년 이후 출생자 기준입니다</p>
        </div>

      </div>
    </AppLayout>
  )
}
