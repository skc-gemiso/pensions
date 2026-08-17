"use client"

import { useEffect, useMemo, useState } from "react"
import AppLayout from "@/components/AppLayout"
import { getProfile, type ProfileView } from "@/app/actions/profile"
import { getEtfDividendHistory } from "@/app/sim/actions"
// 수령 개시 나이는 개인연금과 같은 값을 쓴다 (PENSION_PER_PAYOUT_AGE)
import { getPerConfig } from "@/app/pension/per/actions"

// 프로필(config/.env → lib/settings.ts)을 못 읽었을 때만 쓰는 값
const FALLBACK_JOIN = "2015-02-23"
const FALLBACK_RETIRE = "2034-06-30"
const ANNUAL_SALARY_INCREASE_MAN = 240 // 만원/년

// 사용자 제공 예상 데이터 (2030~2034)
const USER_PROJECTIONS: Record<number, { salaryMan: number; grossMan: number; netMan: number }> = {
  2030: { salaryMan: 9_992,  grossMan: 14_800, netMan: 14_200 },
  2031: { salaryMan: 10_232, grossMan: 15_500, netMan: 14_800 },
  2032: { salaryMan: 10_472, grossMan: 16_200, netMan: 15_400 },
  2033: { salaryMan: 10_712, grossMan: 16_900, netMan: 16_000 },
  2034: { salaryMan: 10_952, grossMan: 17_600, netMan: 16_700 },
}

// 퇴직금 운용 시뮬레이션 기준 — IRP·ISA 는 운용하지 않으므로 일반 계좌 기준이다
const CC_STOCK_CODE = "498400"        // KODEX 200 타겟위클리커버드콜
const CC_FALLBACK_ANNUAL_RATE = 0.17  // 분배 이력을 못 읽었을 때만 쓰는 값
const DIVIDEND_TAX = 0.154            // 배당소득세 (소득세 14% + 지방소득세 1.4%)
const FIN_INCOME_LIMIT_MAN = 2_000    // 금융소득종합과세 기준 (연 2,000만원)

// 커버드콜 분배금은 대부분 파생상품 매매이익이라 과세 대상이 아니다.
// 실제 과세되는 금액은 주당 과세표준액(tax_base_amt) 뿐이고, 분배금의 5% 안팎이다.
// 세금도 종합과세 판정도 이 과세표준액 기준으로 한다.
const TAX_BASE_RATIO_FALLBACK = 0.05

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

/** 분배금 → 세후 분배금. 과세는 분배금 전액이 아니라 과세표준액에만 붙는다 */
function afterDividendTax(gross: number, taxBaseRatio: number): number {
  return gross - gross * taxBaseRatio * DIVIDEND_TAX
}

function calcCurrentSeverance(
  monthlyWon: number, tenureDays: number,
  ccAnnualRate: number, taxBaseRatio: number, holdMonths: number
) {
  const grossMan = Math.round((monthlyWon * (tenureDays / 365)) / 10_000)
  const tenureYears = Math.max(1, Math.round(tenureDays / 365))
  const taxMan = calcRetirementTax(grossMan, tenureYears)
  const netMan = grossMan - taxMan
  // 정년에 매입해 수령 개시까지 재투자한 뒤 받는 세후 월 분배금
  const grown = grownValue(netMan, ccAnnualRate, taxBaseRatio, holdMonths)
  const ccMonthlyMan = Math.round(afterDividendTax(grown * ccAnnualRate, taxBaseRatio) / 12)
  return { grossMan, netMan, taxMan, ccMonthlyMan }
}

/**
 * 분배금을 전액 재투자했을 때의 평가액.
 * 주가는 현재가 고정(상승률 0%)이라 세후 분배금만큼만 늘어난다.
 */
function grownValue(
  principal: number, ccAnnualRate: number, taxBaseRatio: number, months: number
): number {
  const monthlyNetRate = ccAnnualRate / 12 * (1 - taxBaseRatio * DIVIDEND_TAX)
  return principal * Math.pow(1 + monthlyNetRate, months)
}

/** 'YYYY-MM-DD' → Date (UTC 밀림 방지) */
function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export default function RetirementPensionPage() {
  const today = useMemo(() => new Date(), [])
  const [profile, setProfile] = useState<ProfileView | null>(null)
  const [ccRate, setCcRate] = useState<{ annual: number; taxBaseRatio: number; count: number } | null>(null)

  useEffect(() => { getProfile().then(setProfile).catch(() => {}) }, [])

  // 커버드콜 분배율·과표비율 — 개인연금 화면과 같은 기준(최근 12회)을 쓴다
  useEffect(() => {
    getEtfDividendHistory(CC_STOCK_CODE)
      .then(rows => {
        const recent = rows.slice(0, 12)
        if (recent.length === 0) return
        const monthly = recent.reduce((s, r) => s + r.dist_rate, 0) / recent.length / 100
        const distSum = recent.reduce((s, r) => s + r.dist_amt, 0)
        const baseSum = recent.reduce((s, r) => s + r.tax_base_amt, 0)
        setCcRate({
          annual: monthly * 12,
          // 회차별 편차가 크므로 단순평균이 아니라 합계 대비 비율(가중평균)을 쓴다
          taxBaseRatio: distSum > 0 ? baseSum / distSum : TAX_BASE_RATIO_FALLBACK,
          count: recent.length,
        })
      })
      .catch(() => {})
  }, [])

  const [payoutAge, setPayoutAge] = useState(63)
  useEffect(() => { getPerConfig().then(c => setPayoutAge(c.payout_age)).catch(() => {}) }, [])

  const ccAnnualRate = ccRate?.annual ?? CC_FALLBACK_ANNUAL_RATE
  const taxBaseRatio = ccRate?.taxBaseRatio ?? TAX_BASE_RATIO_FALLBACK

  // 입사일·정년은 공통 프로필에서 온다 (정년 규정: 만 60세가 되는 달의 말일 등)
  const JOIN_DATE = useMemo(() => toDate(profile?.join_date ?? FALLBACK_JOIN), [profile])
  const retireDate = useMemo(() => toDate(profile?.retire_date ?? FALLBACK_RETIRE), [profile])
  const LEGAL_RETIRE_YEAR = retireDate.getFullYear()

  // 수령 개시 시점 — 만 payoutAge 세가 되는 연·월 (생년월일 기준)
  const payoutIdx = useMemo(() => {
    const b = toDate(profile?.birth_date ?? "1974-06-04")
    return (b.getFullYear() + payoutAge) * 12 + b.getMonth()
  }, [profile, payoutAge])

  // 재투자 기간 — DB형이라 정년에 퇴직금을 받아 그때 매입한다. 그 전에는 ETF 를 살 수 없다
  const holdMonths = useMemo(() => Math.max(
    0, payoutIdx - (retireDate.getFullYear() * 12 + retireDate.getMonth())
  ), [payoutIdx, retireDate])

  const tenure = useMemo(() => calcTenure(JOIN_DATE, today), [JOIN_DATE, today])

  // 현재 기준 추정 퇴직금 (급여명세서 지급액 기준: 6,900,000원/월)
  const currentSeverance = useMemo(
    () => calcCurrentSeverance(6_900_000, tenure.totalDays, ccAnnualRate, taxBaseRatio, holdMonths),
    [tenure.totalDays, ccAnnualRate, taxBaseRatio, holdMonths]
  )

  // 정년까지 남은 기간
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

  /**
   * 실수령 퇴직금을 정년에 커버드콜로 매입 → 수령 개시까지 분배금 전액 재투자
   * → 그 뒤부터 분배금만 수령.
   *
   * DB형이라 정년 전에는 회사가 적립금을 운용하므로 ETF 를 매입할 수 없다.
   * 정년 이전에 발생하는 분배금은 없다.
   */
  const ccRows = useMemo(() => tableRows.map(row => {
    const valueMan      = grownValue(row.netMan, ccAnnualRate, taxBaseRatio, holdMonths)
    const yearlyGross   = Math.round(valueMan * ccAnnualRate)
    const monthlyGross  = Math.round(yearlyGross / 12)
    const yearlyTaxBase = Math.round(yearlyGross * taxBaseRatio)   // 실제 과세 대상
    const yearlyNet     = Math.round(afterDividendTax(yearlyGross, taxBaseRatio))
    const monthlyNet    = Math.round(yearlyNet / 12)
    return {
      ...row,
      valueMan: Math.round(valueMan),
      yearlyGross, monthlyGross, yearlyTaxBase, yearlyNet, monthlyNet,
      // 종합과세 판정도 분배금 전액이 아니라 과세표준액 기준이다
      overFinLimit: yearlyTaxBase > FIN_INCOME_LIMIT_MAN,
    }
  }), [tableRows, ccAnnualRate, taxBaseRatio, holdMonths])

  const joinStr = "2015.02.23"
  const retireStr = `${LEGAL_RETIRE_YEAR}년 ${String(retireDate.getMonth() + 1).padStart(2, "0")}월`

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-5">

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
              <p className="text-xs text-blue-400 mb-0.5">{payoutAge}세 월 분배금(세후)</p>
              <p className="text-xl font-bold text-indigo-700">약 {fmtMan(currentSeverance.ccMonthlyMan)}</p>
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

        {/* 퇴직금 커버드콜 운용 시뮬레이션 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">퇴직금 커버드콜 운용 시 분배금 시뮬레이션</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              정년({LEGAL_RETIRE_YEAR}년 {retireDate.getMonth() + 1}월)에 실수령 퇴직금 전액으로 KODEX 200 타겟위클리커버드콜을 매입 →
              <b className="text-gray-500"> {payoutAge}세까지 분배금 전액 재투자</b> →
              <b className="text-amber-600"> {payoutAge}세부터 분배금 수령</b>
            </p>
          </div>

          {/* 운용 기준 */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-semibold text-emerald-800">KODEX 200 타겟위클리커버드콜 100%</p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    IRP·ISA 는 운용하지 않으므로 일시금 수령 후 일반 계좌에서 운용하는 기준입니다.
                  </p>
                </div>
                <div className="flex gap-5 text-right">
                  <div>
                    <p className="text-xs text-emerald-600">연 분배율</p>
                    <p className="text-lg font-bold text-emerald-700 tabular-nums">
                      {(ccAnnualRate * 100).toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-emerald-500">
                      {ccRate ? `최근 ${ccRate.count}회 평균` : "기본 추정치"}
                    </p>
                  </div>
                  <div className="border-l border-emerald-200 pl-5">
                    <p className="text-xs text-emerald-600">과표 비율</p>
                    <p className="text-lg font-bold text-emerald-700 tabular-nums">
                      {(taxBaseRatio * 100).toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-emerald-500">
                      실효세율 {(taxBaseRatio * DIVIDEND_TAX * 100).toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs">
                  <th className="px-4 py-2 text-left font-medium text-gray-500" rowSpan={2}>퇴직 시점</th>
                  <th className="px-4 py-2 text-center font-semibold text-gray-600 border-l border-gray-200" colSpan={2}>
                    정년({LEGAL_RETIRE_YEAR}년) 매입 후 {holdMonths}개월 재투자
                  </th>
                  <th className="px-4 py-2 text-center font-semibold text-amber-700 bg-amber-50 border-l border-gray-200" colSpan={4}>
                    {payoutAge}세부터 매달 수령
                  </th>
                </tr>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                  <th className="px-4 py-2 text-right font-medium border-l border-gray-200">투자 원금</th>
                  <th className="px-4 py-2 text-right font-medium">{payoutAge}세 평가액</th>
                  <th className="px-4 py-2 text-right font-medium bg-amber-50 border-l border-gray-200">월 분배금(세전)</th>
                  <th className="px-4 py-2 text-right font-medium bg-amber-50">연 과세 대상</th>
                  <th className="px-4 py-2 text-right font-medium bg-amber-50">월 분배금(세후)</th>
                  <th className="px-4 py-2 text-right font-medium bg-amber-50">연 분배금(세후)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ccRows.map(row => (
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
                    <td className="px-4 py-3 text-right text-gray-500 text-xs border-l border-gray-100">{fmtMan(row.netMan)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-gray-600">{fmtMan(row.valueMan)}</span>
                    </td>

                    <td className="px-4 py-3 text-right bg-amber-50/60 border-l border-gray-200">
                      <span className="text-gray-600">{fmtMan(row.monthlyGross)}</span>
                      <span className="text-xs text-gray-400">/월</span>
                    </td>
                    <td className="px-4 py-3 text-right bg-amber-50/60">
                      <span className="text-gray-400 text-xs">{fmtMan(row.yearlyTaxBase)}</span>
                      {row.overFinLimit && (
                        <span className="ml-1 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">종합과세</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right bg-amber-50/60">
                      <span className="font-bold text-amber-700">{fmtMan(row.monthlyNet)}</span>
                      <span className="text-xs text-gray-400">/월</span>
                    </td>
                    <td className="px-4 py-3 text-right bg-amber-50/60">
                      <span className="font-bold text-blue-700">{fmtMan(row.yearlyNet)}</span>
                      <span className="text-xs text-gray-400">/년</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 text-[11px] text-gray-400 space-y-1">
            <p>• 분배율·과표 비율은 실제 지급 이력 최근 12회 기준 · 개인연금 화면과 같은 데이터</p>
            <p>• 원금(수량)은 헐지 않고 분배금만 받는 구조 — 주가가 오르내려도 수량은 유지된다</p>
            <p>
              • <span className="text-gray-500 font-medium">과세는 분배금 전액이 아니라 과세표준액에만 붙는다.</span>{" "}
              커버드콜 분배금은 대부분 파생상품 매매이익이라 비과세이고, 과세 대상은 분배금의{" "}
              {(taxBaseRatio * 100).toFixed(1)}% 수준이다 → 실효세율 {(taxBaseRatio * DIVIDEND_TAX * 100).toFixed(2)}%
            </p>
            <p>• 세후 = 분배금 − (분배금 × 과표 비율 × 배당소득세 15.4%)</p>
            <p>
              • <b>DB형이라 정년 전에는 ETF 를 매입할 수 없다.</b> 회사가 적립금을 운용하므로
              퇴직금은 정년에 손에 들어오고, 그 전에 발생하는 분배금은 없다
            </p>
            <p>
              • 매입 시점은 <b>정년({LEGAL_RETIRE_YEAR}년 {retireDate.getMonth() + 1}월)</b>,
              재투자 기간은 {payoutAge}세까지 <b>{holdMonths}개월</b>로 모든 행이 같다.
              각 행은 &ldquo;그 해 퇴직했다면 퇴직금이 얼마인가&rdquo;의 차이만 반영한다
            </p>
            <p>• 주가는 현재가 고정(상승률 0%)이라 평가액은 재투자한 분배금만큼만 늘어난다 — {holdMonths}개월 재투자로 약 {(Math.pow(1 + ccAnnualRate / 12 * (1 - taxBaseRatio * DIVIDEND_TAX), holdMonths)).toFixed(2)}배</p>
            <p>• <span className="text-red-500 font-medium">금융소득종합과세</span>(연 2,000만원) 판정도 과세표준액 기준이라, 분배금이 커도 대상이 되기 어렵다</p>
            <p>• 과표 비율은 회차마다 0%~16%로 편차가 크다 — 위 값은 최근 12회 합계 기준 가중평균이다</p>
            <p>• 주가가 떨어지면 평가액이 줄고, 같은 분배율이어도 분배금이 함께 줄어든다</p>
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
          <p>• IRP·ISA 는 운용 계획이 없어 다루지 않습니다. 퇴직금을 IRP 로 이전하면 퇴직소득세가 이연·감면되지만, 이 화면은 일시금 수령 후 일반 계좌에서 운용하는 기준입니다</p>
        </div>

      </div>
    </AppLayout>
  )
}
