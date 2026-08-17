/**
 * 환경 변수로 관리하는 개인 설정.
 *
 * 개인 정보(생년월일·입사일·정년)와 개인연금 적립 계획은 DB 테이블이 아니라
 * `config/.env` 에 둔다. 값이 바뀌는 일이 거의 없고, 사용자도 한 명뿐이라
 * 테이블·마이그레이션·수정 UI 를 유지할 이유가 없다.
 *
 * 값을 바꾸면 **dev 서버를 재시작**해야 한다 —
 * next.config.ts 가 서버 기동 시 한 번만 dotenv 로 읽는다.
 * Vercel 배포본은 대시보드의 환경 변수를 바꾼 뒤 재배포해야 한다.
 *
 * 서버 전용 모듈. 클라이언트 컴포넌트에서 import 하지 않는다.
 */

import type { Profile, RetireRule } from "@/lib/profile"

const RETIRE_RULES: RetireRule[] = ["birthday", "month_end", "year_end"]

function str(key: string, fallback: string): string {
  const v = process.env[key]?.trim()
  return v ? v : fallback
}

function int(key: string, fallback: number): number {
  const v = Number(process.env[key]?.replace(/[^0-9-]/g, ""))
  return Number.isFinite(v) && v !== 0 ? v : fallback
}

function date(key: string, fallback: string): string {
  const v = str(key, fallback)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new Error(`${key} 형식이 올바르지 않습니다 (YYYY-MM-DD): ${v}`)
  }
  return v
}

/**
 * 개인 정보 — 개인연금·퇴직연금·국민연금 화면이 공유한다.
 *
 * PROFILE_BIRTH_DATE   생년월일 YYYY-MM-DD
 * PROFILE_JOIN_DATE    입사일   YYYY-MM-DD
 * PROFILE_RETIRE_AGE   정년 나이
 * PROFILE_RETIRE_RULE  birthday | month_end | year_end
 */
export function profileFromEnv(): Profile {
  const rule = str("PROFILE_RETIRE_RULE", "month_end") as RetireRule
  return {
    birth_date: date("PROFILE_BIRTH_DATE", "1974-06-04"),
    join_date: date("PROFILE_JOIN_DATE", "2015-02-23"),
    retire_age: int("PROFILE_RETIRE_AGE", 60),
    retire_rule: RETIRE_RULES.includes(rule) ? rule : "month_end",
  }
}

export type PerSettings = {
  payout_age: number
  monthly_amount: number
  account_no: string
  stock_code: string
}

/**
 * 개인연금 적립 계획.
 *
 * PENSION_PER_PAYOUT_AGE      수령 개시 나이
 * PENSION_PER_MONTHLY_AMOUNT  월 적립액 (원)
 * PENSION_PER_ACCOUNT_NO      재원 계좌번호
 * PENSION_PER_STOCK_CODE      재원 종목코드
 */
export function perSettingsFromEnv(): PerSettings {
  return {
    payout_age: int("PENSION_PER_PAYOUT_AGE", 63),
    monthly_amount: int("PENSION_PER_MONTHLY_AMOUNT", 500000),
    account_no: str("PENSION_PER_ACCOUNT_NO", "201-04-931585"),
    stock_code: str("PENSION_PER_STOCK_CODE", "498400"),
  }
}
