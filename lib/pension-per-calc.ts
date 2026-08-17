/**
 * 개인연금(연금저축펀드) 적립·수령 시뮬레이션 — DB·세션과 무관한 순수 함수.
 * 산식은 docs/pension/per/per_task.md 참고.
 */

export type PerInputs = {
  /** 현재 보유수량 */
  quantity: number
  /** 현재 주가 */
  price: number
  /** 월 분배율 (0.0145 = 1.45%) */
  monthlyRate: number
  /** 월 적립액 */
  monthlyAmount: number
  /** 시작 시점 'YYYY-MM' (보통 이번 달) */
  startYm: string
  /** 적립 종료 'YYYY-MM' (퇴직) */
  retireYm: string
  /** 수령 개시 'YYYY-MM' */
  payoutYm: string
}

export type PerPhase = {
  ym: string
  age: number | null
  phase: "적립" | "거치" | "수령"
  quantity: number
  value: number
  distribution: number
}

export type PerResult = {
  /** 적립 개월 수 */
  accumMonths: number
  /** 거치 개월 수 */
  holdMonths: number
  /** 총 납입 원금 (현재 평가액 + 앞으로 적립할 금액) */
  totalContribution: number
  /** 시작 시점 보유수량 (= 현재 보유수량) */
  initialQuantity: number
  /** 적립금으로 매수한 수량 */
  contributedQuantity: number
  /** 수령 개시 시점 보유수량 = initialQuantity + contributedQuantity + reinvestedQuantity */
  finalQuantity: number
  /** 수령 개시 시점 평가액 */
  finalValue: number
  /** 수령 개시 후 월 분배금 */
  monthlyPayout: number
  /** 연 분배금 */
  yearlyPayout: number
  /** 재투자로 늘어난 수량 */
  reinvestedQuantity: number
  /** 연도별 추이 (매년 말) */
  yearly: PerPhase[]
}

/** 'YYYY-MM' → 월 인덱스 */
function ymToIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number)
  return y * 12 + (m - 1)
}

function indexToYm(idx: number): string {
  const y = Math.floor(idx / 12)
  const m = (idx % 12) + 1
  return `${y}-${String(m).padStart(2, "0")}`
}

/** 생년월 기준 해당 'YYYY-MM' 시점의 만 나이 */
export function ageAt(birthYm: string, ym: string): number {
  return Math.floor((ymToIndex(ym) - ymToIndex(birthYm)) / 12)
}

/** 생년월 + 나이 → 그 나이가 되는 'YYYY-MM' */
export function ymAtAge(birthYm: string, age: number): string {
  return indexToYm(ymToIndex(birthYm) + age * 12)
}

/**
 * 월 단위 시뮬레이션.
 *
 * 적립기간: 월 적립액 + 분배금을 재투자
 * 거치기간: 분배금만 재투자
 * 수령개시: 수량 고정, 분배금 수령
 */
export function simulatePer(inputs: PerInputs, birthYm?: string): PerResult {
  const { quantity, price, monthlyRate, monthlyAmount } = inputs
  const start = ymToIndex(inputs.startYm)
  const retire = ymToIndex(inputs.retireYm)
  const payout = ymToIndex(inputs.payoutYm)

  const accumMonths = Math.max(0, retire - start)
  const holdMonths = Math.max(0, payout - Math.max(retire, start))

  const perShare = price * monthlyRate   // 주당 월 분배금
  let q = quantity
  let contributed = quantity * price     // 현재 평가액을 원금 기준으로 잡는다
  let reinvested = 0

  const yearly: PerPhase[] = []
  const pushSnapshot = (idx: number, phase: PerPhase["phase"]) => {
    yearly.push({
      ym: indexToYm(idx),
      age: birthYm ? ageAt(birthYm, indexToYm(idx)) : null,
      phase,
      quantity: Math.round(q),
      value: Math.round(q * price),
      distribution: Math.round(q * perShare),
    })
  }

  for (let i = start; i < payout; i++) {
    const inAccum = i < retire
    const dist = q * perShare
    const buy = (inAccum ? monthlyAmount : 0) + dist

    if (inAccum) contributed += monthlyAmount
    reinvested += dist / price
    q += buy / price

    // 12월이거나 마지막 달이면 스냅샷
    const ym = indexToYm(i)
    if (ym.endsWith("-12") || i === payout - 1) {
      pushSnapshot(i, inAccum ? "적립" : "거치")
    }
  }

  const monthlyPayout = q * perShare
  pushSnapshot(payout, "수령")

  // 화면에서 "현재 + 적립 + 재투자 = 최종" 이 항상 맞아떨어져야 하므로
  // 적립분은 개별 반올림 대신 나머지로 구해 오차를 흡수한다
  const initialQuantity = Math.round(quantity)
  const reinvestedQuantity = Math.round(reinvested)
  const finalQuantity = Math.round(q)

  return {
    accumMonths,
    holdMonths,
    totalContribution: Math.round(contributed),
    initialQuantity,
    contributedQuantity: finalQuantity - initialQuantity - reinvestedQuantity,
    finalQuantity,
    finalValue: Math.round(q * price),
    monthlyPayout: Math.round(monthlyPayout),
    yearlyPayout: Math.round(monthlyPayout * 12),
    reinvestedQuantity,
    yearly,
  }
}
