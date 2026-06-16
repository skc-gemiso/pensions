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
  year_month: string
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
  year_month: string
  income: number
  expense: number
}

export async function getMonthData(yearMonth: string): Promise<MonthDataRow[]> {
  const pool = getPensionPool()
  const prevMonth = getPrevMonth(yearMonth)

  const { rows } = await pool.query<MonthDataRow>(`
    SELECT
      i.id, i.category, i.sub_category, i.name,
      i.payment_method, i.payment_day, i.default_amount,
      i.account_no, i.settlement_start_day, i.settlement_end_day,
      i.sort_order, i.is_active,
      c.id   AS info_id,
      COALESCE(c.amount, 0)::int   AS amount,
      c.memo,
      COALESCE(p.amount, 0)::int   AS prev_amount
    FROM my_cost_item i
    LEFT JOIN my_cost_info c ON c.item_id = i.id AND c.year_month = $1::text
    LEFT JOIN my_cost_info p ON p.item_id = i.id AND p.year_month = $2::text
    WHERE i.is_active = TRUE
    ORDER BY
      CASE i.category
        WHEN '기타수입'  THEN 1
        WHEN '고정지출'  THEN 2
        WHEN '고정이체'  THEN 3
        WHEN '생활비'    THEN 4
        WHEN '카드결재'  THEN 5
        ELSE 9
      END,
      i.sort_order,
      i.id
  `, [yearMonth, prevMonth])

  return rows
}

export async function getRecentMonths(yearMonth: string, n: number): Promise<RecentMonthSummary[]> {
  const pool = getPensionPool()
  const months: string[] = []
  let [y, m] = yearMonth.split("-").map(Number)
  for (let i = 0; i < n; i++) {
    months.push(`${y}-${String(m).padStart(2, "0")}`)
    m--
    if (m === 0) { m = 12; y-- }
  }

  const { rows } = await pool.query<RecentMonthSummary>(`
    SELECT
      c.year_month,
      COALESCE(SUM(CASE WHEN i.category = '기타수입' THEN c.amount ELSE 0 END), 0)::int AS income,
      COALESCE(SUM(CASE WHEN i.category != '기타수입' THEN c.amount ELSE 0 END), 0)::int AS expense
    FROM my_cost_info c
    JOIN my_cost_item i ON i.id = c.item_id
    WHERE c.year_month = ANY($1::text[])
    GROUP BY c.year_month
    ORDER BY c.year_month DESC
  `, [months])

  return months.map(ym => rows.find(r => r.year_month === ym) ?? { year_month: ym, income: 0, expense: 0 })
}

export async function upsertCostInfo(
  yearMonth: string,
  itemId: number,
  amount: number,
  memo: string | null
): Promise<void> {
  const pool = getPensionPool()
  await pool.query(`
    INSERT INTO my_cost_info (year_month, item_id, amount, memo, updated_at)
    VALUES ($1::text, $2, $3, $4, NOW())
    ON CONFLICT (year_month, item_id)
    DO UPDATE SET amount = EXCLUDED.amount, memo = EXCLUDED.memo, updated_at = NOW()
  `, [yearMonth, itemId, amount, memo])
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
}): Promise<CostItem> {
  const pool = getPensionPool()
  const { rows } = await pool.query<CostItem>(`
    INSERT INTO my_cost_item
      (category, sub_category, name, payment_method, payment_day,
       default_amount, account_no, settlement_start_day, settlement_end_day, sort_order)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *
  `, [
    data.category,
    data.sub_category ?? null,
    data.name,
    data.payment_method ?? null,
    data.payment_day ?? null,
    data.default_amount ?? 0,
    data.account_no ?? null,
    data.settlement_start_day ?? null,
    data.settlement_end_day ?? null,
    data.sort_order ?? 0,
  ])
  return rows[0]
}

export async function updateCostItem(id: number, data: Partial<Omit<CostItem, "id" | "is_active" | "created_at">>): Promise<void> {
  const pool = getPensionPool()
  const fields = Object.keys(data) as (keyof typeof data)[]
  if (fields.length === 0) return
  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(", ")
  const values = fields.map(f => data[f])
  await pool.query(`UPDATE my_cost_item SET ${setClause} WHERE id = $1`, [id, ...values])
}

export async function deactivateCostItem(id: number): Promise<void> {
  const pool = getPensionPool()
  await pool.query(`UPDATE my_cost_item SET is_active = FALSE WHERE id = $1`, [id])
}

export async function copyFromPrevMonth(yearMonth: string): Promise<void> {
  const pool = getPensionPool()
  const prevMonth = getPrevMonth(yearMonth)
  await pool.query(`
    INSERT INTO my_cost_info (year_month, item_id, amount, memo)
    SELECT $1::text, item_id, amount, memo
    FROM my_cost_info
    WHERE year_month = $2::text
    ON CONFLICT (year_month, item_id) DO NOTHING
  `, [yearMonth, prevMonth])
  // 이전 달에 없는 항목은 default_amount로 초기화
  await pool.query(`
    INSERT INTO my_cost_info (year_month, item_id, amount)
    SELECT $1::text, i.id, i.default_amount
    FROM my_cost_item i
    WHERE i.is_active = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM my_cost_info c WHERE c.year_month = $1::text AND c.item_id = i.id
      )
    ON CONFLICT (year_month, item_id) DO NOTHING
  `, [yearMonth])
}

function getPrevMonth(yearMonth: string): string {
  let [y, m] = yearMonth.split("-").map(Number)
  m--
  if (m === 0) { m = 12; y-- }
  return `${y}-${String(m).padStart(2, "0")}`
}
