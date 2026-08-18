/**
 * 퇴직연금(DB형) 계산 — DB·세션과 무관한 순수 함수.
 *
 * 퇴직연금 화면(`/pension/ret`)과 연금 통합 대시보드(`/pension/my`)가 함께 쓴다.
 * 산식은 docs/pension/ret/ret_task.md 참고.
 */

/** 급여명세서 지급액 (원/월) */
export const MONTHLY_SALARY_WON = 6_900_000
/** 연봉 인상 가정 (만원/년) */
export const ANNUAL_SALARY_INCREASE_MAN = 240
/** 입사 연도 — 근속연수 계산 기준 */
export const JOIN_YEAR = 2015

/** 회사가 사전 계산해 준 값 (2030~2034) */
export const USER_PROJECTIONS: Record<number, { salaryMan: number; grossMan: number; netMan: number }> = {
  2030: { salaryMan: 9_992,  grossMan: 14_800, netMan: 14_200 },
  2031: { salaryMan: 10_232, grossMan: 15_500, netMan: 14_800 },
  2032: { salaryMan: 10_472, grossMan: 16_200, netMan: 15_400 },
  2033: { salaryMan: 10_712, grossMan: 16_900, netMan: 16_000 },
  2034: { salaryMan: 10_952, grossMan: 17_600, netMan: 16_700 },
}

/** KODEX 200 타겟위클리커버드콜 */
export const CC_STOCK_CODE = "498400"
/** 분배 이력을 못 읽었을 때만 쓰는 연 분배율 */
export const CC_FALLBACK_ANNUAL_RATE = 0.17
/** DB형 퇴직연금을 개인이 수령·운용할 수 있게 되는 나이 */
export const DB_ACCESS_AGE = 55

export type RetirementRow = {
  year: number
  tenureYears: number
  salaryMan: number
  grossMan: number
  netMan: number
  taxMan: number
  /** 회사 사전 계산값이면 true, 법정 공식 추정이면 false */
  isConfirmed: boolean
  isLegal: boolean
}

/** 퇴직소득세 (2023년 개정 기준, 만원 단위, 근사치) */
export function calcRetirementTax(grossMan: number, tenureYears: number): number {
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

/**
 * 퇴직 시점별 예상 퇴직금.
 *
 * 2030~2034년은 회사 사전 계산값을 그대로 쓰고 (`taxMan = grossMan − netMan`),
 * 그 이전은 법정 공식(연봉 ÷ 12 × 근속연수)으로 추정한다.
 * 두 구간의 계산 방식이 달라 경계에서 금액이 크게 뛴다.
 */
export function buildRetirementRows(startYear: number, retireYear: number): RetirementRow[] {
  const rows: RetirementRow[] = []

  for (let year = Math.max(startYear, 2026); year <= retireYear; year++) {
    const tenureYears = year - JOIN_YEAR
    const isLegal = year === retireYear
    const d = USER_PROJECTIONS[year]

    if (d) {
      rows.push({
        year, tenureYears,
        salaryMan: d.salaryMan,
        grossMan: d.grossMan,
        netMan: d.netMan,
        taxMan: d.grossMan - d.netMan,
        isConfirmed: true, isLegal,
      })
    } else {
      const salaryMan = USER_PROJECTIONS[2030].salaryMan + (year - 2030) * ANNUAL_SALARY_INCREASE_MAN
      const grossMan = Math.round(salaryMan / 12 * tenureYears)
      const taxMan = calcRetirementTax(grossMan, tenureYears)
      rows.push({
        year, tenureYears, salaryMan, grossMan,
        netMan: grossMan - taxMan,
        taxMan,
        isConfirmed: false, isLegal,
      })
    }
  }
  return rows
}

/** 오늘까지의 근속만 반영한 추정 퇴직금 */
export function calcCurrentSeverance(monthlyWon: number, tenureDays: number) {
  const grossMan = Math.round((monthlyWon * (tenureDays / 365)) / 10_000)
  const tenureYears = Math.max(1, Math.round(tenureDays / 365))
  const taxMan = calcRetirementTax(grossMan, tenureYears)
  return { grossMan, taxMan, netMan: grossMan - taxMan }
}

/**
 * 분배금을 전액 재투자했을 때의 평가액.
 * 주가는 현재가 고정(상승률 0%)이라 분배금만큼만 늘어난다.
 */
export function grownValue(principal: number, ccAnnualRate: number, months: number): number {
  return principal * Math.pow(1 + ccAnnualRate / 12, months)
}

/** 'YYYY-MM-DD' → Date (UTC 밀림 방지) */
export function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function calcTenure(from: Date, to: Date) {
  const totalDays = Math.floor((to.getTime() - from.getTime()) / 86_400_000)
  let years = to.getFullYear() - from.getFullYear()
  let months = to.getMonth() - from.getMonth()
  if (months < 0) { years -= 1; months += 12 }
  if (to.getDate() < from.getDate()) months -= 1
  if (months < 0) { years -= 1; months += 12 }
  return { years, months, days: to.getDate(), totalDays }
}
