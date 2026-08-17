/**
 * 전기요금 계산 — DB·세션과 무관한 순수 함수.
 * 산식과 검증 결과는 docs/life/power/power_task.md 참고.
 */

export type PowerRate = {
  season: "S" | "O"        // S=여름(07.01~08.31), O=기타계절
  tier1_limit: number      // 1구간 폭 (여름 300, 기타 200)
  tier2_limit: number      // 2구간 폭 (여름 150, 기타 200)
  base1: number
  base2: number
  base3: number
  rate1: number
  rate2: number
  rate3: number
  welfare_limit: number    // 복지할인 월 한도
  env_rate: number         // 환경요금 단가
  fuel_rate: number        // 연료비조정 단가
  fund_rate: number        // 전력기금률(%)
  vat_rate: number         // 부가세율(%)
}

/** 계절 구간 하나의 안분 결과 */
export type SeasonSegment = {
  season: "S" | "O"
  days: number
  ratio: number            // days / totalDays
  usage: number            // 안분 사용량
  tier1_limit: number      // 안분 1구간 상한
  tier2_limit: number      // 안분 2구간 상한
  tier: 1 | 2 | 3          // 안분 사용량이 속한 구간
  energy: number           // 안분 전력량요금
  base: number             // 안분 기본요금
}

export type PowerCalc = {
  totalDays: number
  segments: SeasonSegment[]
  baseCharge: number       // 기본요금 (반올림)
  energyCharge: number     // 전력량요금 (반올림)
  envCharge: number        // 환경요금
  fuelCharge: number       // 연료비조정
  chargeBefore: number     // 전기요금 (할인 전)
  /** 복지할인 한도 기준(6~8월) 일수 분해 — 전력량 요금 계절과 다르다 */
  welfareDays: { summerDays: number; otherDays: number; totalDays: number }
  welfareLimit: number     // 복지할인 한도액 (소수 유지)
  applyWelfare: boolean    // 복지할인 적용 여부
  welfareDiscount: number  // 복지할인 (음수)
  seasonDiscount: number   // 하계/동계 할인 (수동 입력, 음수)
  taxable: number          // 과세대상 전기요금
  vat: number              // 부가세
  fund: number             // 전력기금
  total: number            // 청구요금
  targetKwh: number        // 목표 사용량 (안분 1구간 상한)
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * 하계 기간이 두 가지로 다르다 — 한전 고지서로 확인한 값이다.
 *
 * - 전력량 요금(누진 구간·단가·기본요금): **7~8월**
 * - 복지(장애인)할인 한도: **6~8월** — 중증장애인 할인 고시가
 *   6~8월 월 20,000원 / 9~5월 월 16,000원이다.
 *   2026-06 고지서(05.22~06.21, 31일)의 한도
 *   `16,000×10/31 + 20,000×21/31 = 18,709.68원` 과 일치한다.
 *
 * 한도 금액은 요금표(welfare_limit)에서 관리한다. 적용 월이 바뀔 때만 아래를 고친다.
 */
const SUMMER_MONTHS_RATE = [7, 8]
const SUMMER_MONTHS_WELFARE = [6, 7, 8]

/** 검침일 — 사용기간은 항상 "전월 22일 ~ 당월 21일" 이라 요금월에서 유도한다 */
export const METER_DAY = 21

/** 요금월 'YYYY-MM' → 사용기간 { start: 전월 22일, end: 당월 21일 } */
export function derivePeriod(yyyymm: string): { start: string; end: string } {
  const [y, m] = yyyymm.split("-").map(Number)
  const pad = (n: number) => String(n).padStart(2, "0")
  const prevY = m === 1 ? y - 1 : y
  const prevM = m === 1 ? 12 : m - 1
  return {
    start: `${prevY}-${pad(prevM)}-${pad(METER_DAY + 1)}`,
    end: `${y}-${pad(m)}-${pad(METER_DAY)}`,
  }
}

/** 'YYYY-MM-DD' → UTC 기준 Date (타임존 밀림 방지) */
function toUTCDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** 사용기간의 각 날짜를 순회한다 (양끝 포함) */
function eachDay(periodStart: string, periodEnd: string, fn: (d: Date) => void): number {
  const start = toUTCDate(periodStart)
  const end = toUTCDate(periodEnd)
  if (end.getTime() < start.getTime()) return 0
  let count = 0
  for (let t = start.getTime(); t <= end.getTime(); t += MS_PER_DAY) {
    count++
    fn(new Date(t))
  }
  return count
}

/**
 * 사용기간을 전력량 요금 기준 계절별 일수로 나눈다 (양끝 포함).
 * 사용기간 `05.22~06.21` 은 31일이며, 한전 고지서도 이 일수를 쓴다.
 */
export function splitSeasonDays(
  periodStart: string,
  periodEnd: string
): { summerDays: number; otherDays: number; totalDays: number } {
  let summerDays = 0
  const totalDays = eachDay(periodStart, periodEnd, d => {
    if (SUMMER_MONTHS_RATE.includes(d.getUTCMonth() + 1)) summerDays++
  })
  return { summerDays, otherDays: totalDays - summerDays, totalDays }
}

/** 복지할인 한도 기준(6~8월) 일수 분해 */
export function splitWelfareDays(
  periodStart: string,
  periodEnd: string
): { summerDays: number; otherDays: number; totalDays: number } {
  let summerDays = 0
  const totalDays = eachDay(periodStart, periodEnd, d => {
    if (SUMMER_MONTHS_WELFARE.includes(d.getUTCMonth() + 1)) summerDays++
  })
  return { summerDays, otherDays: totalDays - summerDays, totalDays }
}

/** 누진 구간 계산 — 상한은 각 구간의 폭 */
function progressive(
  usage: number,
  t1: number,
  t2: number,
  r1: number,
  r2: number,
  r3: number
): { energy: number; tier: 1 | 2 | 3 } {
  if (usage <= t1) return { energy: usage * r1, tier: 1 }
  if (usage <= t1 + t2) return { energy: t1 * r1 + (usage - t1) * r2, tier: 2 }
  return { energy: t1 * r1 + t2 * r2 + (usage - t1 - t2) * r3, tier: 3 }
}

const round0 = (n: number) => Math.round(n)
/** 10원 절사 */
const floor10 = (n: number) => Math.floor(n / 10) * 10

/**
 * 청구 1건 계산.
 *
 * 계절 경계를 걸치면 사용량·구간상한·기본요금을 모두 일수로 안분한다(한전 방식).
 * 복지할인 한도도 같은 비율로 안분한다.
 */
export function calcPowerBill(params: {
  periodStart: string
  periodEnd: string
  usageKwh: number
  seasonDiscount?: number   // 하계/동계 할인 (음수)
  applyWelfare?: boolean    // 장애인 복지할인 적용 여부 (기본 true)
  targetKwh?: number | null // 직접 지정한 목표. 없으면 안분 1구간 상한
  summerRate: PowerRate
  otherRate: PowerRate
}): PowerCalc {
  const { periodStart, periodEnd, usageKwh, summerRate, otherRate } = params
  const seasonDiscount = params.seasonDiscount ?? 0
  const applyWelfare = params.applyWelfare ?? true

  const { summerDays, otherDays, totalDays } = splitSeasonDays(periodStart, periodEnd)

  // 복지할인 한도는 하계 기간이 달라(6~8월) 별도로 분해한다
  const wf = splitWelfareDays(periodStart, periodEnd)

  // 계절별 안분 — 한전은 안분 사용량을 정수 kWh로 반올림한다.
  // 2026-07 고지서(06.22~07.21, 288kWh)가 86 / 202 로 나뉘어 32,034원이 된다.
  // (86.4 / 201.6 을 그대로 쓰면 32,062원이 되어 28원 어긋난다)
  // 마지막 구간은 나머지를 받아 합계가 항상 사용량과 같게 맞춘다.
  const planned = [
    { season: "O" as const, days: otherDays, rate: otherRate },
    { season: "S" as const, days: summerDays, rate: summerRate },
  ].filter(p => p.days > 0)

  const segments: SeasonSegment[] = []
  let assigned = 0
  planned.forEach((p, i) => {
    const ratio = totalDays > 0 ? p.days / totalDays : 0
    const usage = i === planned.length - 1
      ? usageKwh - assigned
      : Math.round(usageKwh * ratio)
    assigned += usage

    const t1 = p.rate.tier1_limit * ratio
    const t2 = p.rate.tier2_limit * ratio
    const { energy, tier } = progressive(usage, t1, t2, p.rate.rate1, p.rate.rate2, p.rate.rate3)
    const baseOfTier = tier === 1 ? p.rate.base1 : tier === 2 ? p.rate.base2 : p.rate.base3
    segments.push({
      season: p.season, days: p.days, ratio, usage,
      tier1_limit: t1, tier2_limit: t2, tier,
      energy,
      base: baseOfTier * ratio,
    })
  })

  // 부가 단가는 계절 무관 — 일수가 많은 쪽 요금표를 따른다
  const mainRate = summerDays > otherDays ? summerRate : otherRate

  const energyCharge = round0(segments.reduce((s, x) => s + x.energy, 0))
  const baseCharge = round0(segments.reduce((s, x) => s + x.base, 0))
  const envCharge = round0(usageKwh * mainRate.env_rate)
  const fuelCharge = round0(usageKwh * mainRate.fuel_rate)

  const chargeBefore = baseCharge + energyCharge + envCharge + fuelCharge

  // 하계 기간이 전력량 요금과 달라 세그먼트와 무관하게 따로 계산한다
  const welfareLimit = totalDays > 0
    ? (otherRate.welfare_limit * wf.otherDays + summerRate.welfare_limit * wf.summerDays) / totalDays
    : 0
  const welfareDiscount = applyWelfare ? -Math.floor(Math.min(chargeBefore, welfareLimit)) : 0

  const taxable = chargeBefore + welfareDiscount + seasonDiscount
  const vat = round0(taxable * (mainRate.vat_rate / 100))
  const fund = floor10(taxable * (mainRate.fund_rate / 100))
  const total = floor10(taxable + vat + fund)

  const autoTarget = segments.reduce((s, x) => s + x.tier1_limit, 0)
  const targetKwh = params.targetKwh != null ? params.targetKwh : Math.round(autoTarget * 10) / 10

  return {
    totalDays, segments,
    baseCharge, energyCharge, envCharge, fuelCharge, chargeBefore,
    welfareDays: wf, welfareLimit, applyWelfare, welfareDiscount, seasonDiscount,
    taxable, vat, fund, total, targetKwh,
  }
}
