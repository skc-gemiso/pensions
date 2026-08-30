/**
 * 개인 프로필 — 생년월일·입사일·정년 규정.
 *
 * 화면마다 하드코딩돼 있던 값을 한 곳으로 모은 것이다.
 * 개인연금·퇴직연금·국민연금 화면이 모두 이 값을 쓴다.
 */

export type RetireRule = "birthday" | "month_end" | "year_end"

export type Profile = {
  birth_date: string    // 'YYYY-MM-DD'
  join_date: string     // 'YYYY-MM-DD'
  retire_age: number    // 정년 나이
  retire_rule: RetireRule
}

export const RETIRE_RULE_LABEL: Record<RetireRule, string> = {
  birthday:  "만 N세가 되는 날",
  month_end: "만 N세가 되는 달의 말일",
  year_end:  "만 N세가 되는 해의 12월 31일",
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/** 해당 연·월의 말일 */
function lastDayOfMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

/**
 * 정년 날짜를 계산한다.
 *
 * 1974-06-04 · 60세 기준
 *   birthday  → 2034-06-04
 *   month_end → 2034-06-30
 *   year_end  → 2034-12-31
 */
export function calcRetireDate(profile: Profile): string {
  const [y, m, d] = profile.birth_date.split("-").map(Number)
  const ry = y + profile.retire_age

  switch (profile.retire_rule) {
    case "birthday":
      return `${ry}-${pad(m)}-${pad(d)}`
    case "year_end":
      return `${ry}-12-31`
    case "month_end":
    default:
      return `${ry}-${pad(m)}-${pad(lastDayOfMonth(ry, m))}`
  }
}

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export function toYm(date: string): string {
  return date.slice(0, 7)
}

/** 정년 다음 달 — 적립·근무가 끝난 뒤 첫 달 (시뮬레이션의 종료 경계로 쓴다) */
export function retireEndYm(profile: Profile): string {
  const [y, m] = calcRetireDate(profile).split("-").map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`
}

/** 기준일의 만 나이 */
export function ageOn(birthDate: string, on: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number)
  const [oy, om, od] = on.split("-").map(Number)
  let age = oy - by
  if (om < bm || (om === bm && od < bd)) age--
  return age
}

/** 생년월일 기준 만 N세가 되는 'YYYY-MM' */
export function ymAtAge(birthDate: string, age: number): string {
  const [y, m] = birthDate.split("-").map(Number)
  return `${y + age}-${pad(m)}`
}

/**
 * 그 달에 도달하는 만 나이 — `ymAtAge()` 의 역함수.
 *
 * 수령 개시월은 생일이 든 달이라 **1일 기준으로 재면 생일 전이어서 한 살 적게 나온다.**
 * (생일 6/4 인데 2039-06-01 로 재면 만 64세, 실제로는 그 달에 65세가 된다.)
 * 그 달의 생일을 기준으로 잰다.
 */
export function ageInYm(birthDate: string, ym: string): number {
  return ageOn(birthDate, `${ym}-${birthDate.slice(8, 10)}`)
}

/** Date → 'YYYY-MM-DD' (로컬 기준) */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
