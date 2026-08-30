/**
 * 퇴직연금(DB형) 계산 — DB·세션과 무관한 순수 함수.
 *
 * 퇴직연금 화면(`/pension/ret`)과 연금 통합 대시보드(`/pension/my`)가 함께 쓴다.
 * 산식은 docs/pension/ret/ret_task.md 참고.
 */

/**
 * 퇴직금 산정 기준. 값은 `PENSION_RET_*` 환경 변수에서 오고
 * (`lib/settings.ts` `retSettingsFromEnv()`), 이 모듈은 순수 함수로 남는다 —
 * 클라이언트 컴포넌트도 import 하므로 여기서 process.env 를 읽으면 안 된다.
 */
export type SalaryBasis = {
  /** 급여명세서 지급액 계 (원/월) */
  monthly_wage: number
  /** 연 상여금 (원) — 명절·연말 + 인센티브 */
  annual_bonus: number
  /** 연봉 인상 (원/년) */
  annual_raise: number
  /** 인상이 반영되는 달 (1~12) */
  raise_month: number
  /** 그 명세서의 연월 'YYYY-MM' — 인상분 기산점 */
  wage_base_ym: string
}

/**
 * 월 평균임금 = 지급액 계 + 연 상여금 ÷ 12.
 *
 * 법정 평균임금은 퇴직 전 3개월 임금총액에 **연 상여금의 3/12** 를 더해 산정하므로,
 * 월로 환산하면 연 상여금 ÷ 12 가 된다.
 */
export function avgMonthlyWage(b: Pick<SalaryBasis, "monthly_wage" | "annual_bonus">): number {
  return b.monthly_wage + b.annual_bonus / 12
}

/**
 * 기준 명세서 이후 인상을 몇 번 지났는지.
 *
 * 인상은 매년 `raise_month` 에 한 번 있다. 연도 차이로만 세면 기준 명세서가
 * 인상월 이전 것일 때 한 번씩 어긋나므로, 인상월 통과 여부를 같이 센다.
 */
function raiseCount(b: SalaryBasis, on: Date): number {
  const [baseYear, baseMonth] = b.wage_base_ym.split("-").map(Number)
  const passed = (y: number, m: number) => y + (m >= b.raise_month ? 1 : 0)
  return passed(on.getFullYear(), on.getMonth() + 1) - passed(baseYear, baseMonth)
}

/** 그 시점에 퇴직한다고 볼 때의 월 평균임금 — 지나온 인상분을 얹는다 */
export function avgMonthlyWageAt(b: SalaryBasis, on: Date): number {
  return avgMonthlyWage(b) + raiseCount(b, on) * (b.annual_raise / 12)
}

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
 * 그 이전은 급여명세서 기반 평균임금으로 추정한다 — `calcCurrentSeverance` 와 같은
 * 산식(평균임금 × 재직일수 ÷ 365)이라 "현재 기준" 카드와 표가 이어진다.
 * 두 구간의 계산 방식이 달라 경계에서 금액이 뛴다.
 *
 * @param basis      급여명세서 기준 (PENSION_RET_*)
 * @param joinDate   입사일 — 재직일수 계산
 * @param retireDate 정년일 — 각 행은 "그 해의 같은 월·일에 퇴직"으로 본다
 */
export function buildRetirementRows(
  startYear: number,
  retireYear: number,
  basis: SalaryBasis,
  joinDate: Date,
  retireDate: Date,
): RetirementRow[] {
  const rows: RetirementRow[] = []

  for (let year = Math.max(startYear, 2026); year <= retireYear; year++) {
    const isLegal = year === retireYear
    const d = USER_PROJECTIONS[year]

    if (d) {
      rows.push({
        year,
        tenureYears: year - joinDate.getFullYear(),
        salaryMan: d.salaryMan,
        grossMan: d.grossMan,
        netMan: d.netMan,
        taxMan: d.grossMan - d.netMan,
        isConfirmed: true, isLegal,
      })
    } else {
      const leaveOn = new Date(year, retireDate.getMonth(), retireDate.getDate())
      const { totalDays } = calcTenure(joinDate, leaveOn)
      const monthlyWage = avgMonthlyWageAt(basis, leaveOn)
      const { grossMan, taxMan, netMan } = calcCurrentSeverance(monthlyWage, totalDays)
      rows.push({
        year,
        tenureYears: Math.max(1, Math.round(totalDays / 365)),
        salaryMan: Math.round(monthlyWage * 12 / 10_000),
        grossMan, netMan, taxMan,
        isConfirmed: false, isLegal,
      })
    }
  }
  return rows
}

/** 그 시점까지의 근속만 반영한 추정 퇴직금 */
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
