"use server"

import { getPensionPool } from "@/lib/pension-db"
import { requireAdmin } from "@/lib/guard"
import { simulatePer, type PerResult } from "@/lib/pension-per-calc"
import { getProfile } from "@/app/actions/profile"
import { perSettingsFromEnv, type PerSettings } from "@/lib/settings"
import { retireEndYm, ymAtAge, ageOn } from "@/lib/profile"

/**
 * 적립 계획 — 출처는 `config/.env` 다 (DB 테이블 없음).
 * 생년월일·정년은 공통 프로필(`getProfile`)에서 온다.
 */
export type PerConfig = PerSettings

export type PerOverview = {
  account_no: string
  account_nm: string | null
  stock_code: string
  stock_name: string | null
  /** 현재 보유수량 */
  quantity: number
  /** 최신 종가 */
  price: number
  price_date: string | null
  /** 평가액 */
  value: number
  /** 매입금액 */
  buy_amount: number
  /** 평가손익 */
  profit: number
  /** 월 분배율 (0.0145) */
  monthly_rate: number
  /** 주당 월 분배금 */
  per_share: number
  /** 현재 수량 기준 월 분배금 */
  current_monthly_dist: number
  /** 누적 수령 분배금 — 분배금 지급 이력 × 13일 기산 보유수량 */
  received_dist: number
  /** 분배금을 받은 횟수 */
  received_count: number
  /** 지급기준일별 내역 (최신순) */
  received_rows: {
    ref_date: string; qty: number; per_share: number; amount: number
    /** 지급기준일 종가 (원) — 휴장일이면 직전 거래일 */
    close_price: number | null
    close_date: string | null
  }[]
}

export type PerScenario = {
  retire_age: number
  retire_ym: string
  accumMonths: number
  finalQuantity: number
  finalValue: number
  monthlyPayout: number
  /** 기본(설정된 퇴직나이) 대비 차이 */
  diffFromBase: number
}

export type PerProjection = {
  base: PerResult
  scenarios: PerScenario[]
  startYm: string
  /** 적립이 끝난 뒤 첫 달 (정년 다음 달) */
  retireYm: string
  /** 정년 날짜 — 프로필 규정으로 계산 */
  retireDate: string
  retireAge: number
  payoutYm: string
  currentAge: number
}

// ── 설정 ──────────────────────────────────────────────────────────────────────

export async function getPerConfig(): Promise<PerConfig> {
  await requireAdmin()
  return perSettingsFromEnv()
}

// ── 현황 ──────────────────────────────────────────────────────────────────────

export async function getPerOverview(): Promise<PerOverview> {
  await requireAdmin()

  const cfg = await getPerConfig()
  const pool = getPensionPool()

  const { rows: hold } = await pool.query(`
    SELECT
      COALESCE(SUM(ms.qty), 0)::float8 AS quantity,
      COALESCE(SUM(CASE WHEN ms.qty > 0 THEN ms.qty * ms.s_amt ELSE 0 END), 0)::float8 AS buy_amount,
      (SELECT account_nm FROM my_account WHERE account_no = $1) AS account_nm,
      (SELECT COALESCE(stock_short_name, stock_name) FROM t_stock_list WHERE stock_code = $2) AS stock_name
    FROM my_stock ms
    WHERE ms.account_no = $1 AND ms.stock_code = $2
  `, [cfg.account_no, cfg.stock_code])

  const { rows: px } = await pool.query(`
    SELECT e_amt::float8 AS price, e_date::text AS price_date
    FROM t_stock_amt WHERE stock_code = $1 ORDER BY e_date DESC LIMIT 1
  `, [cfg.stock_code])

  // 월 분배율 — 최근 12회 평균 (조회 시점 기준으로 자동 반영)
  const { rows: dr } = await pool.query(`
    SELECT COALESCE(AVG(dist_rate), 0)::float8 AS rate FROM (
      SELECT dist_rate FROM t_etf_dividend WHERE stock_code = $1
      ORDER BY ref_date DESC LIMIT 12
    ) t
  `, [cfg.stock_code])

  // 누적 분배금 — 주식 배당 팝업(getMonthlyDividendByAccount)과 같은 규칙.
  // 각 지급기준일의 "해당 월 13일까지 누적 순수량" × 주당 분배금
  // 지급기준일이 휴장일일 수 있어 그 날짜 이하의 최신 종가를 붙인다
  const { rows: rd } = await pool.query<{
    ref_date: string; qty: number; per_share: number; amount: number
    e_amt: number | null; e_date: string | null
  }>(`
    SELECT
      TO_CHAR(d.ref_date, 'YYYY-MM-DD')       AS ref_date,
      SUM(ms.qty)::int                        AS qty,
      d.dist_amt::int                         AS per_share,
      ROUND(SUM(ms.qty) * d.dist_amt)::int    AS amount,
      px.e_amt,
      TO_CHAR(px.e_date, 'YYYY-MM-DD')        AS e_date
    FROM t_etf_dividend d
    JOIN my_stock ms
      ON ms.stock_code = d.stock_code
     AND ms.account_no = $1
     AND ms.s_date <= TO_CHAR(d.ref_date, 'YYYYMM') || '13'
    LEFT JOIN LATERAL (
      SELECT e_amt, e_date FROM t_stock_amt
      WHERE stock_code = d.stock_code AND e_date <= d.ref_date
      ORDER BY e_date DESC LIMIT 1
    ) px ON TRUE
    WHERE d.stock_code = $2
    GROUP BY d.ref_date, d.dist_amt, px.e_amt, px.e_date
    HAVING SUM(ms.qty) > 0
    ORDER BY d.ref_date DESC
  `, [cfg.account_no, cfg.stock_code])

  const quantity = Number(hold[0]?.quantity ?? 0)
  const price = Number(px[0]?.price ?? 0)
  const buy_amount = Math.round(Number(hold[0]?.buy_amount ?? 0))
  const monthly_rate = Number(dr[0]?.rate ?? 0) / 100
  const per_share = price * monthly_rate
  const value = Math.round(quantity * price)

  return {
    account_no: cfg.account_no,
    account_nm: hold[0]?.account_nm ?? null,
    stock_code: cfg.stock_code,
    stock_name: hold[0]?.stock_name ?? null,
    quantity,
    price,
    price_date: px[0]?.price_date ?? null,
    value,
    buy_amount,
    profit: value - buy_amount,
    monthly_rate,
    per_share: Math.round(per_share),
    current_monthly_dist: Math.round(quantity * per_share),
    received_dist: rd.reduce((s, r) => s + Number(r.amount), 0),
    received_count: rd.length,
    received_rows: rd.map(r => ({
      ref_date: r.ref_date,
      qty: Number(r.qty),
      per_share: Number(r.per_share),
      amount: Number(r.amount),
      close_price: r.e_amt == null ? null : Number(r.e_amt),
      close_date: r.e_date ?? null,
    })),
  }
}

// ── 시뮬레이션 ────────────────────────────────────────────────────────────────

export async function getPerProjection(): Promise<PerProjection> {
  await requireAdmin()

  const [cfg, ov, profile] = await Promise.all([getPerConfig(), getPerOverview(), getProfile()])

  const now = new Date()
  const startYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const birthYm = profile.birth_date.slice(0, 7)
  // 정년이 속한 달까지 적립하므로 경계는 그 다음 달
  const retireYm = retireEndYm(profile)
  const payoutYm = ymAtAge(profile.birth_date, cfg.payout_age)

  const common = {
    quantity: ov.quantity,
    price: ov.price,
    monthlyRate: ov.monthly_rate,
    monthlyAmount: cfg.monthly_amount,
    startYm,
    payoutYm,
  }

  const base = simulatePer({ ...common, retireYm }, birthYm)

  // 조기 퇴직 시나리오 — 정년보다 이른 나이에 그만두는 경우
  const currentAge = ageOn(profile.birth_date, `${startYm}-01`)
  const scenarios: PerScenario[] = []
  for (let age = Math.max(currentAge + 1, profile.retire_age - 6); age <= profile.retire_age; age++) {
    // 정년과 같은 나이면 규정(말일 등)을 반영한 실제 경계를 쓴다
    const ym = age === profile.retire_age ? retireYm : ymAtAge(profile.birth_date, age)
    const r = simulatePer({ ...common, retireYm: ym }, birthYm)
    scenarios.push({
      retire_age: age,
      retire_ym: ym,
      accumMonths: r.accumMonths,
      finalQuantity: r.finalQuantity,
      finalValue: r.finalValue,
      monthlyPayout: r.monthlyPayout,
      diffFromBase: r.monthlyPayout - base.monthlyPayout,
    })
  }

  return {
    base, scenarios, startYm, retireYm,
    retireDate: profile.retire_date,
    retireAge: profile.retire_age,
    payoutYm, currentAge,
  }
}
