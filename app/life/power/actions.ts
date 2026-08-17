"use server"

import { getPensionPool } from "@/lib/pension-db"
import { calcPowerBill, splitSeasonDays, derivePeriod, type PowerRate, type PowerCalc } from "@/lib/power-calc"

export type PowerRateRow = PowerRate & {
  id: number
  apply_start: string
  memo: string | null
}

export type PowerBill = {
  id: number
  yyyymm: string
  /** 요금월에서 유도한 사용기간 (DB 컬럼 아님) */
  period_start: string
  period_end: string
  usage_kwh: number
  season_discount: number
  welfare_yn: string
  target_kwh: number | null
  /** 요금표로 계산한 결과. 요금표가 없으면 null */
  calc: PowerCalc | null
}

export type DailyUsage = {
  use_date: string
  usage_kwh: number | null
}

export type DailyView = {
  yyyymm: string
  period_start: string
  period_end: string
  rows: DailyUsage[]
  total: number
  target: number
  remain: number
  filledDays: number
  totalDays: number
}

// ── 요금표 ────────────────────────────────────────────────────────────────────

const RATE_COLUMNS = `
  id, apply_start::text AS apply_start, season,
  tier1_limit, tier2_limit, base1, base2, base3,
  rate1::float8 AS rate1, rate2::float8 AS rate2, rate3::float8 AS rate3,
  welfare_limit,
  env_rate::float8  AS env_rate,
  fuel_rate::float8 AS fuel_rate,
  fund_rate::float8 AS fund_rate,
  vat_rate::float8  AS vat_rate,
  memo
`

export async function getRates(): Promise<PowerRateRow[]> {
  const pool = getPensionPool()
  const { rows } = await pool.query<PowerRateRow>(`
    SELECT ${RATE_COLUMNS} FROM my_power_rate
    ORDER BY apply_start DESC, season
  `)
  return rows
}

export async function upsertRate(data: {
  id?: number | null
  apply_start: string
  season: "S" | "O"
  tier1_limit: number
  tier2_limit: number
  base1: number
  base2: number
  base3: number
  rate1: number
  rate2: number
  rate3: number
  welfare_limit: number
  env_rate: number
  fuel_rate: number
  fund_rate: number
  vat_rate: number
  memo?: string | null
}): Promise<void> {
  const pool = getPensionPool()
  const values = [
    data.apply_start, data.season, data.tier1_limit, data.tier2_limit,
    data.base1, data.base2, data.base3,
    data.rate1, data.rate2, data.rate3,
    data.welfare_limit, data.env_rate, data.fuel_rate, data.fund_rate, data.vat_rate,
    data.memo ?? null,
  ]

  if (data.id) {
    await pool.query(`
      UPDATE my_power_rate SET
        apply_start = $1::date, season = $2, tier1_limit = $3, tier2_limit = $4,
        base1 = $5, base2 = $6, base3 = $7, rate1 = $8, rate2 = $9, rate3 = $10,
        welfare_limit = $11, env_rate = $12, fuel_rate = $13, fund_rate = $14, vat_rate = $15,
        memo = $16, updated_at = NOW()
      WHERE id = $17
    `, [...values, data.id])
    return
  }

  await pool.query(`
    INSERT INTO my_power_rate
      (apply_start, season, tier1_limit, tier2_limit, base1, base2, base3,
       rate1, rate2, rate3, welfare_limit, env_rate, fuel_rate, fund_rate, vat_rate, memo)
    VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    ON CONFLICT (apply_start, season) DO UPDATE SET
      tier1_limit = EXCLUDED.tier1_limit, tier2_limit = EXCLUDED.tier2_limit,
      base1 = EXCLUDED.base1, base2 = EXCLUDED.base2, base3 = EXCLUDED.base3,
      rate1 = EXCLUDED.rate1, rate2 = EXCLUDED.rate2, rate3 = EXCLUDED.rate3,
      welfare_limit = EXCLUDED.welfare_limit, env_rate = EXCLUDED.env_rate,
      fuel_rate = EXCLUDED.fuel_rate, fund_rate = EXCLUDED.fund_rate,
      vat_rate = EXCLUDED.vat_rate, memo = EXCLUDED.memo, updated_at = NOW()
  `, values)
}

export async function deleteRate(id: number): Promise<void> {
  const pool = getPensionPool()
  await pool.query(`DELETE FROM my_power_rate WHERE id = $1`, [id])
}

/** 사용기간 종료일 기준으로 적용할 계절별 요금표를 고른다 */
function pickRates(rates: PowerRateRow[], periodEnd: string): { summer: PowerRateRow; other: PowerRateRow } | null {
  const pick = (season: "S" | "O") =>
    rates
      .filter(r => r.season === season && r.apply_start <= periodEnd)
      .sort((a, b) => (a.apply_start < b.apply_start ? 1 : -1))[0] ?? null
  const summer = pick("S")
  const other = pick("O")
  if (!summer || !other) return null
  return { summer, other }
}

// ── 월별 청구 ─────────────────────────────────────────────────────────────────

export async function getBills(): Promise<PowerBill[]> {
  const pool = getPensionPool()
  const [{ rows }, rates] = await Promise.all([
    pool.query(`
      SELECT id, yyyymm, usage_kwh::float8 AS usage_kwh, season_discount, welfare_yn,
             target_kwh::float8 AS target_kwh
      FROM my_power_bill ORDER BY yyyymm DESC
    `),
    getRates(),
  ])

  return rows.map(r => {
    const { start, end } = derivePeriod(r.yyyymm)
    const picked = pickRates(rates, end)
    return {
      ...r,
      period_start: start,
      period_end: end,
      calc: picked
        ? calcPowerBill({
            periodStart: start,
            periodEnd: end,
            usageKwh: Number(r.usage_kwh),
            seasonDiscount: Number(r.season_discount),
            applyWelfare: r.welfare_yn === "Y",
            targetKwh: r.target_kwh,
            summerRate: picked.summer,
            otherRate: picked.other,
          })
        : null,
    }
  })
}

/** 청구 등록·수정. 사용기간은 요금월에서 유도하므로 입력받지 않는다. */
export async function upsertBill(data: {
  yyyymm: string
  usage_kwh: number
  season_discount?: number
  welfare_yn?: string
}): Promise<void> {
  if (!data.yyyymm) throw new Error("요금월을 입력하세요.")

  const pool = getPensionPool()
  await pool.query(`
    INSERT INTO my_power_bill (yyyymm, usage_kwh, season_discount, welfare_yn)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (yyyymm) DO UPDATE SET
      usage_kwh = EXCLUDED.usage_kwh, season_discount = EXCLUDED.season_discount,
      welfare_yn = EXCLUDED.welfare_yn, updated_at = NOW()
  `, [data.yyyymm, data.usage_kwh, data.season_discount ?? 0, data.welfare_yn ?? "Y"])
}

/** 일별 사용량 탭의 목표 사용량 설정. null 이면 안분 1구간 상한 자동 */
export async function setTargetKwh(yyyymm: string, target: number | null): Promise<void> {
  const pool = getPensionPool()
  await pool.query(
    `UPDATE my_power_bill SET target_kwh = $2, updated_at = NOW() WHERE yyyymm = $1`,
    [yyyymm, target]
  )
}

export async function deleteBill(yyyymm: string): Promise<void> {
  const pool = getPensionPool()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(`DELETE FROM my_power_daily WHERE yyyymm = $1`, [yyyymm])
    await client.query(`DELETE FROM my_power_bill WHERE yyyymm = $1`, [yyyymm])
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }
}

// ── 일별 사용량 ───────────────────────────────────────────────────────────────

export async function getDailyUsage(yyyymm: string): Promise<DailyView | null> {
  const pool = getPensionPool()
  const { rows: bills } = await pool.query(`
    SELECT yyyymm, target_kwh::float8 AS target_kwh, usage_kwh::float8 AS usage_kwh
    FROM my_power_bill WHERE yyyymm = $1
  `, [yyyymm])
  if (bills.length === 0) return null
  const period = derivePeriod(yyyymm)
  const bill = { ...bills[0], period_start: period.start, period_end: period.end }

  const { rows: daily } = await pool.query(`
    SELECT use_date::text AS use_date, usage_kwh::float8 AS usage_kwh
    FROM my_power_daily WHERE yyyymm = $1 ORDER BY use_date
  `, [yyyymm])

  const filled = new Map<string, number | null>(daily.map(d => [d.use_date, d.usage_kwh]))

  // 사용기간을 날짜 행으로 펼친다
  const rows: DailyUsage[] = []
  const start = new Date(`${bill.period_start}T00:00:00Z`)
  const end = new Date(`${bill.period_end}T00:00:00Z`)
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const iso = new Date(t).toISOString().slice(0, 10)
    rows.push({ use_date: iso, usage_kwh: filled.has(iso) ? filled.get(iso)! : null })
  }

  const total = rows.reduce((s, r) => s + (r.usage_kwh ?? 0), 0)

  // 목표: 직접 지정값 우선, 없으면 안분 1구간 상한
  let target = bill.target_kwh as number | null
  if (target == null) {
    const rates = await getRates()
    const picked = pickRates(rates, bill.period_end)
    if (picked) {
      const { summerDays, otherDays, totalDays } = splitSeasonDays(bill.period_start, bill.period_end)
      target = totalDays > 0
        ? (picked.summer.tier1_limit * summerDays + picked.other.tier1_limit * otherDays) / totalDays
        : 0
      target = Math.round(target * 10) / 10
    } else {
      target = 0
    }
  }

  return {
    yyyymm,
    period_start: bill.period_start,
    period_end: bill.period_end,
    rows,
    total: Math.round(total * 10) / 10,
    target,
    remain: Math.round((target - total) * 10) / 10,
    filledDays: rows.filter(r => r.usage_kwh != null).length,
    totalDays: rows.length,
  }
}

/** 일별 사용량 1건 저장. kwh 가 null 이면 해당 일자 기록을 지운다 */
export async function upsertDailyUsage(
  yyyymm: string,
  useDate: string,
  kwh: number | null
): Promise<void> {
  const pool = getPensionPool()
  if (kwh == null) {
    await pool.query(`DELETE FROM my_power_daily WHERE yyyymm = $1 AND use_date = $2::date`, [yyyymm, useDate])
    return
  }
  await pool.query(`
    INSERT INTO my_power_daily (yyyymm, use_date, usage_kwh)
    VALUES ($1, $2::date, $3)
    ON CONFLICT (yyyymm, use_date) DO UPDATE SET
      usage_kwh = EXCLUDED.usage_kwh, updated_at = NOW()
  `, [yyyymm, useDate, kwh])
}

/** 일별 합계를 청구의 사용량으로 반영 */
export async function applyDailyTotalToBill(yyyymm: string): Promise<number> {
  const pool = getPensionPool()
  const { rows } = await pool.query<{ total: number }>(`
    SELECT COALESCE(SUM(usage_kwh), 0)::float8 AS total FROM my_power_daily WHERE yyyymm = $1
  `, [yyyymm])
  const total = Math.round((rows[0]?.total ?? 0) * 10) / 10
  await pool.query(
    `UPDATE my_power_bill SET usage_kwh = $2, updated_at = NOW() WHERE yyyymm = $1`,
    [yyyymm, total]
  )
  return total
}
