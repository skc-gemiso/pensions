"use server"

import { getPensionPool } from "@/lib/pension-db"

export type CostItem = {
  id: number
  category: string
  sub_category: string | null
  name: string
  payment_method: string | null
  payment_day: number | null
  default_amount: number
  account_no: string | null
  settlement_start_day: number | null
  settlement_end_day: number | null
  sort_order: number
  is_active: boolean
}

export type CostInfo = {
  id: number
  yyyymm: string
  item_id: number
  amount: number
  memo: string | null
}

export type MonthDataRow = CostItem & {
  info_id: number | null
  amount: number
  memo: string | null
  prev_amount: number
}

export type RecentMonthSummary = {
  yyyymm: string
  income: number
  expense: number
}

export async function getMonthData(yyyymm: string): Promise<MonthDataRow[]> {
  const pool = getPensionPool()
  const prevMonth = getPrevMonth(yyyymm)

  const { rows } = await pool.query<MonthDataRow>(`
    SELECT
      i.id,
      i.item_type1  AS category,
      i.item_type2  AS sub_category,
      i.item_nm     AS name,
      i.cost_type   AS payment_method,
      i.pay_dd      AS payment_day,
      i.amt         AS default_amount,
      NULL::text    AS account_no,
      NULL::int     AS settlement_start_day,
      NULL::int     AS settlement_end_day,
      0             AS sort_order,
      TRUE          AS is_active,
      c.id          AS info_id,
      COALESCE(c.amt, 0)::int AS amount,
      c.memo,
      COALESCE(p.amt, 0)::int AS prev_amount
    FROM my_cost_item i
    LEFT JOIN my_cost_info c ON c.item_id::int = i.id AND c.yyyymm = $1::text
    LEFT JOIN my_cost_info p ON p.item_id::int = i.id AND p.yyyymm = $2::text
    WHERE i.use_yn = 'Y'
    ORDER BY
      CASE i.item_type1
        WHEN '기타수입'  THEN 1
        WHEN '고정지출'  THEN 2
        WHEN '고정이체'  THEN 3
        WHEN '생활비'    THEN 4
        WHEN '카드결재'  THEN 5
        ELSE 9
      END,
      i.id
  `, [yyyymm, prevMonth])

  return rows
}

export async function getRecentMonths(yyyymm: string, n: number): Promise<RecentMonthSummary[]> {
  const pool = getPensionPool()
  const months: string[] = []
  let [y, m] = yyyymm.split("-").map(Number)
  for (let i = 0; i < n; i++) {
    months.push(`${y}-${String(m).padStart(2, "0")}`)
    m--
    if (m === 0) { m = 12; y-- }
  }

  const { rows } = await pool.query<RecentMonthSummary>(`
    SELECT
      c.yyyymm,
      COALESCE(SUM(CASE WHEN i.item_type1 = '기타수입' THEN c.amt ELSE 0 END), 0)::int AS income,
      COALESCE(SUM(CASE WHEN i.item_type1 != '기타수입' THEN c.amt ELSE 0 END), 0)::int AS expense
    FROM my_cost_info c
    JOIN my_cost_item i ON i.id = c.item_id::int
    WHERE c.yyyymm = ANY($1::text[])
    GROUP BY c.yyyymm
    ORDER BY c.yyyymm DESC
  `, [months])

  return months.map(ym => rows.find(r => r.yyyymm === ym) ?? { yyyymm: ym, income: 0, expense: 0 })
}

export async function upsertCostInfo(
  yyyymm: string,
  itemId: number,
  amount: number,
  memo: string | null
): Promise<void> {
  const pool = getPensionPool()
  await pool.query(`
    INSERT INTO my_cost_info (yyyymm, item_id, amt, memo)
    VALUES ($1::text, $2, $3, $4)
    ON CONFLICT (yyyymm, item_id)
    DO UPDATE SET amt = EXCLUDED.amt, memo = EXCLUDED.memo
  `, [yyyymm, itemId, amount, memo])
}

export async function addCostItem(data: {
  category: string
  sub_category?: string | null
  name: string
  payment_method?: string | null
  payment_day?: number | null
  default_amount?: number
  account_no?: string | null
  settlement_start_day?: number | null
  settlement_end_day?: number | null
  sort_order?: number
}): Promise<void> {
  const pool = getPensionPool()
  await pool.query(`
    INSERT INTO my_cost_item (item_type1, item_type2, item_nm, cost_type, pay_dd, amt)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [
    data.category,
    data.sub_category ?? null,
    data.name,
    data.payment_method ?? null,
    data.payment_day ?? null,
    data.default_amount ?? 0,
  ])
}

export async function deactivateCostItem(id: number): Promise<void> {
  const pool = getPensionPool()
  await pool.query(`UPDATE my_cost_item SET use_yn = 'N' WHERE id = $1`, [id])
}

export async function copyFromPrevMonth(yyyymm: string): Promise<void> {
  const pool = getPensionPool()
  const prevMonth = getPrevMonth(yyyymm)
  // 이전 달 실적 복사
  await pool.query(`
    INSERT INTO my_cost_info (yyyymm, item_id, amt, memo)
    SELECT $1::text, item_id, amt, memo
    FROM my_cost_info
    WHERE yyyymm = $2::text
    ON CONFLICT (yyyymm, item_id) DO NOTHING
  `, [yyyymm, prevMonth])
  // 이전 달에 없는 항목은 기본금액으로 초기화
  await pool.query(`
    INSERT INTO my_cost_info (yyyymm, item_id, amt)
    SELECT $1::text, i.id, i.amt
    FROM my_cost_item i
    WHERE i.use_yn = 'Y'
      AND NOT EXISTS (
        SELECT 1 FROM my_cost_info c WHERE c.yyyymm = $1::text AND c.item_id::int = i.id
      )
    ON CONFLICT (yyyymm, item_id) DO NOTHING
  `, [yyyymm])
}

function getPrevMonth(yyyymm: string): string {
  let [y, m] = yyyymm.split("-").map(Number)
  m--
  if (m === 0) { m = 12; y-- }
  return `${y}-${String(m).padStart(2, "0")}`
}
