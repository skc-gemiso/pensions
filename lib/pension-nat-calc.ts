/**
 * 국민연금 조기수령 시나리오 — DB·세션과 무관한 순수 함수.
 *
 * 노령연금을 최대 5년까지 앞당겨 받을 수 있고(조기노령연금), 대신 **평생 감액**된다.
 * 앞당겨 받은 돈을 커버드콜 ETF 에 적립하면 감액분을 만회할 수 있는지 보는 계산이다.
 *
 * 산식은 docs/pension/my/my_task.md 참고.
 */

/** 조기노령연금 감액률 — 1년 앞당길 때마다 6% (월 0.5%). 법정값이라 상수로 둔다 */
export const EARLY_DISCOUNT_PER_YEAR = 0.06

/** 앞당길 수 있는 최대 연수 */
export const EARLY_MAX_YEARS = 5

export type EarlyPensionInput = {
  /** 정상 개시 시 월 수령액 (원, 세후) */
  baseMonthly: number
  /** 정상 개시 나이 */
  normalAge: number
  /** 앞당기는 연수 (1~5) */
  earlyYears: number
  /** ETF 적립을 끝내고 생활비로 돌리는 나이 */
  investUntilAge: number
  /** 조기수령 개시 'YYYY-MM' */
  startYm: string
  /** 적립 종료 'YYYY-MM' */
  investUntilYm: string
  /** 월 분배율 (0.014275 = 1.4275%) */
  monthlyRate: number
}

export type EarlyPensionScenario = {
  startAge: number
  normalAge: number
  earlyYears: number
  /** 감액률(%) — 5년이면 30 */
  discountPct: number
  startYm: string
  investUntilAge: number
  investUntilYm: string
  investMonths: number
  /** 감액된 월 수령액 (원) — 평생 이 금액이다 */
  earlyMonthly: number
  /** 비교 기준 — 정상 개시 월 수령액 */
  baseMonthly: number
  /** 적립 기간에 넣은 총액 */
  contributed: number
  /** 적립 종료 시점 평가액 */
  investedValue: number
  /** 적립분에서 나오는 월 분배금 */
  investMonthly: number
  /** 적립 종료 후 월 수입 = earlyMonthly + investMonthly */
  totalMonthly: number
}

/** 'YYYY-MM' → 월 인덱스 */
function ymToIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number)
  return y * 12 + (m - 1)
}

/**
 * 매월 같은 금액을 넣고 분배금을 전액 재투자했을 때의 평가액.
 *
 * 주가는 현재가 고정(상승률 0%)이라 분배금만큼만 수량이 늘어난다 —
 * 퇴직연금의 `grownValue()` 가 일시금이라면 이쪽은 적립식이다.
 */
export function accumulatedValue(monthly: number, monthlyRate: number, months: number): number {
  if (months <= 0) return 0
  if (monthlyRate === 0) return monthly * months
  return monthly * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate)
}

/**
 * 조기수령 + ETF 적립 시나리오.
 *
 * 감액은 **평생** 이어진다. 적립 종료 후에는 감액된 연금에 적립분의 분배금이 얹힌다.
 * 원금(수량)은 헐지 않으므로 분배금도 줄지 않는다.
 */
export function calcEarlyPension(input: EarlyPensionInput): EarlyPensionScenario {
  const {
    baseMonthly, normalAge, earlyYears, investUntilAge,
    startYm, investUntilYm, monthlyRate,
  } = input

  const discountPct = earlyYears * EARLY_DISCOUNT_PER_YEAR * 100
  const earlyMonthly = Math.round(baseMonthly * (1 - discountPct / 100))

  const investMonths = Math.max(0, ymToIndex(investUntilYm) - ymToIndex(startYm))
  const investedValue = accumulatedValue(earlyMonthly, monthlyRate, investMonths)
  const investMonthly = Math.round(investedValue * monthlyRate)

  return {
    startAge: normalAge - earlyYears,
    normalAge, earlyYears, discountPct,
    startYm, investUntilAge, investUntilYm, investMonths,
    earlyMonthly, baseMonthly,
    contributed: earlyMonthly * investMonths,
    investedValue: Math.round(investedValue),
    investMonthly,
    totalMonthly: earlyMonthly + investMonthly,
  }
}
