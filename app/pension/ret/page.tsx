"use client"

import { useMemo } from "react"
import AppLayout from "@/components/AppLayout"

const JOIN_DATE = new Date(2015, 1, 23) // 2015-02-23
const LEGAL_RETIRE_YEAR = 2034
const ANNUAL_SALARY_INCREASE_MAN = 240 // 만원/년

// 사용자 제공 예상 데이터 (2030~2034)
const USER_PROJECTIONS: Record<number, { salaryMan: number; grossMan: number; netMan: number }> = {
  2030: { salaryMan: 9_992,  grossMan: 14_800, netMan: 14_200 },
  2031: { salaryMan: 10_232, grossMan: 15_500, netMan: 14_800 },
  2032: { salaryMan: 10_472, grossMan: 16_200, netMan: 15_400 },
  2033: { salaryMan: 10_712, grossMan: 16_900, netMan: 16_000 },
  2034: { salaryMan: 10_952, grossMan: 17_600, netMan: 16_700 },
}

// IRP 운용 시뮬레이션 기준
const IRP_CC_RATIO = 0.70    // KODEX 200 커버드콜 비중
const IRP_TDF_RATIO = 0.30   // TIGER TDF2045 비중
const CC_ANNUAL_RATE = 0.15  // 커버드콜 연 배당률 목표 (IRP 내 과세이연)
const TDF_ANNUAL_RATE = 0.05 // TDF 연 수익률 보수적 추정
const PENSION_TAX = 0.055    // 연금소득세 (만 55~69세)

// 퇴직소득세 계산 (2023년 개정 기준, 만원 단위, 근사치)
function calcRetirementTax(grossMan: number, tenureYears: number): number {
  if (tenureYears <= 0) return 0

  // 근속연수공제
  let deduction: number
  if (tenureYears <= 5) deduction = 100 * tenureYears
  else if (tenureYears <= 10) deduction = 500 + 200 * (tenureYears - 5)
  else if (tenureYears <= 20) deduction = 1_500 + 250 * (tenureYears - 10)
  else deduction = 4_000 + 300 * (tenureYears - 20)

  const taxableBase = Math.max(0, grossMan - deduction)
  const converted = (taxableBase / tenureYears) * 12

  // 환산급여공제
  let convDeduction: number
  if (converted <= 800) convDeduction = converted
  else if (converted <= 7_000) convDeduction = 800 + (converted - 800) * 0.6
  else if (converted <= 10_000) convDeduction = 4_520 + (converted - 7_000) * 0.55
  else if (converted <= 30_000) convDeduction = 6_170 + (converted - 10_000) * 0.45
  else convDeduction = 15_170 + (converted - 30_000) * 0.35

  const taxBase = Math.max(0, converted - convDeduction)

  // 기본세율 (2023년 이후 과표구간)
  let taxAtRate: number
  if (taxBase <= 1_400) taxAtRate = taxBase * 0.06
  else if (taxBase <= 5_000) taxAtRate = 84 + (taxBase - 1_400) * 0.15
  else if (taxBase <= 8_800) taxAtRate = 624 + (taxBase - 5_000) * 0.24
  else if (taxBase <= 15_000) taxAtRate = 1_536 + (taxBase - 8_800) * 0.35
  else if (taxBase <= 30_000) taxAtRate = 3_706 + (taxBase - 15_000) * 0.38
  else if (taxBase <= 50_000) taxAtRate = 9_406 + (taxBase - 30_000) * 0.40
  else taxAtRate = 17_406 + (taxBase - 50_000) * 0.42

  const incomeTax = (taxAtRate / 12) * tenureYears
  return Math.round(incomeTax * 1.1) // +지방소득세 10%
}

function fmtMan(man: number): string {
  if (man >= 10_000) {
    const ok = Math.floor(man / 10_000)
    const rem = man % 10_000
    if (rem === 0) return `${ok}억원`
    return `${ok}억 ${rem.toLocaleString()}만원`
  }
  return `${man.toLocaleString()}만원`
}

function calcTenure(from: Date, to: Date): { years: number; months: number; days: number; totalDays: number } {
  const totalDays = Math.floor((to.getTime() - from.getTime()) / 86_400_000)
  let years = to.getFullYear() - from.getFullYear()
  let months = to.getMonth() - from.getMonth()
  if (months < 0) { years -= 1; months += 12 }
  if (to.getDate() < from.getDate()) months -= 1
  if (months < 0) { years -= 1; months += 12 }
  return { years, months, days: to.getDate(), totalDays }
}

function calcCurrentSeverance(monthlyWon: number, tenureDays: number) {
  const grossMan = Math.round((monthlyWon * (tenureDays / 365)) / 10_000)
  const tenureYears = Math.max(1, Math.round(tenureDays / 365))
  const taxMan = calcRetirementTax(grossMan, tenureYears)
  const netMan = grossMan - taxMan
  const irpMonthlyMan = Math.round(
    (netMan * IRP_CC_RATIO * CC_ANNUAL_RATE + netMan * IRP_TDF_RATIO * TDF_ANNUAL_RATE) / 12 * (1 - PENSION_TAX)
  )
  return { grossMan, netMan, taxMan, irpMonthlyMan }
}

export default function RetirementPensionPage() {
  const today = useMemo(() => new Date(), [])
  const tenure = useMemo(() => calcTenure(JOIN_DATE, today), [today])

  // 현재 기준 추정 퇴직금 (급여명세서 지급액 기준: 6,900,000원/월)
  const currentSeverance = useMemo(
    () => calcCurrentSeverance(6_900_000, tenure.totalDays),
    [tenure.totalDays]
  )

  // 정년까지 남은 기간
  const retireDate = useMemo(() => new Date(LEGAL_RETIRE_YEAR, 1, 23), [])
  const remaining = useMemo(() => calcTenure(today, retireDate), [today, retireDate])

  // 진행률 (입사~정년)
  const totalDaysToRetire = useMemo(
    () => Math.floor((retireDate.getTime() - JOIN_DATE.getTime()) / 86_400_000),
    [retireDate]
  )
  const progressPct = Math.min(100, Math.round((tenure.totalDays / totalDaysToRetire) * 100))

  // 테이블 행 생성 (2030~2034: 사용자 데이터, 2026~2029: 선형 보간)
  const tableRows = useMemo(() => {
    const rows = []
    const currentYear = today.getFullYear()
    const startYear = Math.max(currentYear, 2026)

    for (let year = startYear; year <= LEGAL_RETIRE_YEAR; year++) {
      const isConfirmed = year in USER_PROJECTIONS
      const tenureYears = year - 2015
      const isLegal = year === LEGAL_RETIRE_YEAR

      if (isConfirmed) {
        const d = USER_PROJECTIONS[year]
        rows.push({
          year,
          tenureYears,
          salaryMan: d.salaryMan,
          grossMan: d.grossMan,
          netMan: d.netMan,
          taxMan: d.grossMan - d.netMan,
          isConfirmed: true,
          isLegal,
        })
      } else {
        // 2026~2029: 법정 퇴직금 기준 추정 (연봉 ÷ 12 × 근속연수)
        const yearOffset = year - 2030
        const salaryMan = USER_PROJECTIONS[2030].salaryMan + yearOffset * ANNUAL_SALARY_INCREASE_MAN
        const grossMan = Math.round(salaryMan / 12 * tenureYears)
        const taxMan = calcRetirementTax(grossMan, tenureYears)
        const netMan = grossMan - taxMan
        rows.push({
          year,
          tenureYears,
          salaryMan,
          grossMan,
          netMan,
          taxMan,
          isConfirmed: false,
          isLegal,
        })
      }
    }
    return rows
  }, [today])

  const irpRows = useMemo(() => tableRows.map(row => {
    const ccMan    = Math.round(row.netMan * IRP_CC_RATIO)
    const tdfMan   = row.netMan - ccMan
    const ccMonthly     = Math.round(ccMan * CC_ANNUAL_RATE / 12)
    const tdfAnnual     = Math.round(tdfMan * TDF_ANNUAL_RATE)
    const totalMonthly  = Math.round((ccMan * CC_ANNUAL_RATE + tdfAnnual) / 12)
    const afterTaxMonthly = Math.round(totalMonthly * (1 - PENSION_TAX))
    return { ...row, ccMan, tdfMan, ccMonthly, tdfAnnual, totalMonthly, afterTaxMonthly }
  }), [tableRows])

  const joinStr = "2015.02.23"
  const retireStr = `${LEGAL_RETIRE_YEAR}년 02월`

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-5">

        {/* 헤더 */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">퇴직연금</h1>
          <p className="text-gray-500 text-sm">퇴직 시점별 예상 수령액 시뮬레이션 (DB형 기준)</p>
        </div>

        {/* 기본 정보 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">입사일</p>
            <p className="text-base font-bold text-gray-800">{joinStr}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">현재 근속</p>
            <p className="text-base font-bold text-blue-700">
              {tenure.years}년 {tenure.months}개월
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">정년(예정)</p>
            <p className="text-base font-bold text-gray-800">{retireStr}</p>
          </div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
            <p className="text-xs text-amber-500 mb-1">정년까지 남은 기간</p>
            <p className="text-base font-bold text-amber-700">
              {remaining.years}년 {remaining.months}개월
            </p>
          </div>
        </div>

        {/* 근속 진행 바 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>입사 {joinStr}</span>
            <span className="font-medium text-blue-600">{progressPct}% 경과</span>
            <span>정년 {retireStr}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-400 h-3 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-300 mt-1">
            <span>2015</span>
            <span className="text-blue-400 font-medium">{today.getFullYear()}</span>
            <span>{LEGAL_RETIRE_YEAR}</span>
          </div>
        </div>

        {/* 현재 기준 예상 퇴직금 */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <p className="text-xs text-blue-500 font-medium mb-3">
            현재 기준 예상 퇴직금
            <span className="ml-2 text-blue-400 font-normal">
              ({today.getFullYear()}.{String(today.getMonth()+1).padStart(2,"0")}.{String(today.getDate()).padStart(2,"0")} 기준 · 근속 {tenure.years}년 {tenure.months}개월)
            </span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-blue-400 mb-0.5">세전 퇴직금</p>
              <p className="text-xl font-bold text-blue-800">약 {fmtMan(currentSeverance.grossMan)}</p>
            </div>
            <div>
              <p className="text-xs text-blue-400 mb-0.5">퇴직소득세</p>
              <p className="text-xl font-bold text-red-500">약 {fmtMan(currentSeverance.taxMan)}</p>
            </div>
            <div>
              <p className="text-xs text-blue-400 mb-0.5">실수령액</p>
              <p className="text-xl font-bold text-emerald-700">약 {fmtMan(currentSeverance.netMan)}</p>
            </div>
            <div>
              <p className="text-xs text-blue-400 mb-0.5">퇴직연금(월, 세후)</p>
              <p className="text-xl font-bold text-indigo-700">약 {fmtMan(currentSeverance.irpMonthlyMan)}</p>
            </div>
          </div>
          <p className="text-[10px] text-blue-300 mt-3">
            급여명세서 지급액 (6,900,000원/월) × 근속일수({tenure.totalDays}일) ÷ 365 기준 · 세금은 2023년 개정 퇴직소득세 기준 근사치
          </p>
        </div>

        {/* 퇴직 시점별 시나리오 테이블 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">퇴직 시점별 예상 퇴직금</h2>
            <p className="text-xs text-gray-400 mt-0.5">매년 240만원 연봉 인상 가정 · 2026~2029년은 법정 퇴직금 추정 · 2030~2034년은 사전 계산값</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                  <th className="px-4 py-3 text-left font-medium">퇴직 시점</th>
                  <th className="px-4 py-3 text-right font-medium">근속</th>
                  <th className="px-4 py-3 text-right font-medium">예상 연봉</th>
                  <th className="px-4 py-3 text-right font-medium">퇴직금 (세전)</th>
                  <th className="px-4 py-3 text-right font-medium">퇴직소득세</th>
                  <th className="px-4 py-3 text-right font-medium">실수령액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tableRows.map((row) => (
                  <tr
                    key={row.year}
                    className={
                      row.isLegal
                        ? "bg-amber-50"
                        : row.year === today.getFullYear()
                        ? "bg-blue-50"
                        : "hover:bg-gray-50"
                    }
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{row.year}년</span>
                        {row.isLegal && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                            정년
                          </span>
                        )}
                        {row.year === today.getFullYear() && (
                          <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">
                            현재
                          </span>
                        )}
                        {!row.isConfirmed && row.year !== today.getFullYear() && (
                          <span className="text-[10px] text-gray-300">추정</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{row.tenureYears}년</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtMan(row.salaryMan)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtMan(row.grossMan)}</td>
                    <td className="px-4 py-3 text-right text-red-400 text-xs">{fmtMan(row.taxMan)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700">{fmtMan(row.netMan)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* IRP 운용 배당 시뮬레이션 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">IRP 운용 시 배당 수익 시뮬레이션</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              실수령 퇴직금 IRP 전입 후 아래 비율로 계속 운용 가정
            </p>
          </div>

          {/* 포트폴리오 구성 바 */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex rounded-xl overflow-hidden text-xs font-medium h-14">
              <div className="bg-emerald-100 text-emerald-800 flex flex-col items-center justify-center flex-[7] gap-0.5">
                <span>KODEX 200 타겟위클리커버드콜 <strong>70%</strong></span>
                <span className="text-emerald-600 font-normal">연 15% 배당 목표 · IRP 내 과세이연</span>
              </div>
              <div className="bg-blue-100 text-blue-800 flex flex-col items-center justify-center flex-[3] gap-0.5">
                <span>TIGER TDF2045 <strong>30%</strong></span>
                <span className="text-blue-600 font-normal">연 5% 수익 추정</span>
              </div>
            </div>
          </div>

          {/* 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                  <th className="px-4 py-3 text-left font-medium">퇴직 시점</th>
                  <th className="px-4 py-3 text-right font-medium">IRP 전입금</th>
                  <th className="px-4 py-3 text-right font-medium">커버드콜 월배당</th>
                  <th className="px-4 py-3 text-right font-medium">TDF 연수익</th>
                  <th className="px-4 py-3 text-right font-medium">합산 월환산</th>
                  <th className="px-4 py-3 text-right font-medium">퇴직연금(월, 세후)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {irpRows.map(row => (
                  <tr
                    key={row.year}
                    className={
                      row.isLegal
                        ? "bg-amber-50"
                        : row.year === today.getFullYear()
                        ? "bg-blue-50"
                        : "hover:bg-gray-50"
                    }
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{row.year}년</span>
                        {row.isLegal && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">정년</span>
                        )}
                        {row.year === today.getFullYear() && (
                          <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">현재</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">{fmtMan(row.netMan)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-medium text-emerald-700">{fmtMan(row.ccMonthly)}</span>
                      <span className="text-xs text-gray-400">/월</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-blue-600">{fmtMan(row.tdfAnnual)}</span>
                      <span className="text-xs text-gray-400">/년</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-gray-900">{fmtMan(row.totalMonthly)}</span>
                      <span className="text-xs text-gray-400">/월</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-blue-700">{fmtMan(row.afterTaxMonthly)}</span>
                      <span className="text-xs text-gray-400">/월</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 text-[11px] text-gray-400 space-y-1">
            <p>• 커버드콜 배당은 IRP 내 과세이연으로 자동 재투자 (실제 현금 수령은 연금 개시 후)</p>
            <p>• TDF 수익은 매월 분배되지 않고 복리 운용됨 — 합산 월환산은 참고용 수치</p>
            <p>• 연금수령 세후: 연금소득세 5.5% 적용 (만 55~69세 기준) · 만 70세 이상은 4.4%</p>
            <p>• IRP 연금 수령 조건: 만 55세 이상 + 가입 기간 5년 이상</p>
          </div>
        </div>

        {/* 계산 가정 및 주의사항 */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 space-y-1.5">
          <p className="font-medium text-gray-600 mb-2">계산 가정 및 주의사항</p>
          <p>• 연봉 인상: 매년 240만원 균등 인상 가정</p>
          <p>• 퇴직금 기준: DB형(확정급여형) 기준으로 퇴직 시점 직전 평균임금 × 근속연수 방식</p>
          <p>• 세금: 2023년 개정 퇴직소득세 기준 (근속연수공제 · 환산급여공제 적용), 지방소득세 10% 포함</p>
          <p>• 2030~2034년은 사전 계산값(법정 퇴직금보다 높을 수 있음), 2026~2029년은 법정 퇴직금 공식(연봉÷12×근속연수) 적용 추정치</p>
          <p>• 2029→2030년 사이 금액 차이가 크게 보일 수 있으며, 이는 두 구간의 계산 방식이 다르기 때문입니다</p>
          <p>• 실제 퇴직금은 운용수익, 중도인출, 회사 정책 등에 따라 달라질 수 있습니다</p>
        </div>

      </div>
    </AppLayout>
  )
}
