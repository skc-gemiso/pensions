"use server"

import { getPensionPool } from "@/lib/pension-db"

export type CostItem = {
  id: number
  item_type1: string
  item_type2: string | null
  item_nm: string
  cost_type: string | null
  pay_dd: number | null
  amt: number
  memo: string | null
  use_yn: string
}

export type CostInfo = {
  id: number
  yyyymm: string
  item_id: number
  amount: number
  memo: string | null
}

export type MonthDataRow = CostItem & {
  info_id: number
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
      i.item_type1,
      i.item_type2,
      i.item_nm,
      i.cost_type,
      i.pay_dd,
      i.amt,
      i.use_yn,
      c.id          AS info_id,
      c.amt::int    AS amount,
      c.memo,
      COALESCE(p.amt, 0)::int AS prev_amount
    FROM my_cost_info c
    JOIN my_cost_item i ON i.id = c.item_id::int
    LEFT JOIN my_cost_info p ON p.item_id::int = i.id AND p.yyyymm = $2::text
    WHERE c.yyyymm = $1::text
      AND i.use_yn = 'Y'
    ORDER BY
      CASE i.item_type1
        WHEN '5' THEN 1
        WHEN '1' THEN 2
        WHEN '2' THEN 3
        WHEN '3' THEN 4
        WHEN '4' THEN 5
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
      COALESCE(SUM(CASE WHEN i.item_type1 = '5' THEN c.amt ELSE 0 END), 0)::int AS income,
      COALESCE(SUM(CASE WHEN i.item_type1 != '5' THEN c.amt ELSE 0 END), 0)::int AS expense
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
  item_type1: string
  item_type2?: string | null
  item_nm: string
  cost_type?: string | null
  pay_dd?: number | null
  amt?: number
  memo?: string | null
}): Promise<void> {
  const pool = getPensionPool()
  await pool.query(`
    INSERT INTO my_cost_item (item_type1, item_type2, item_nm, cost_type, pay_dd, amt, memo)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [
    data.item_type1,
    data.item_type2 ?? null,
    data.item_nm,
    data.cost_type ?? null,
    data.pay_dd ?? null,
    data.amt ?? 0,
    data.memo ?? null,
  ])
}

export async function getAllCostItems(): Promise<CostItem[]> {
  const pool = getPensionPool()
  const { rows } = await pool.query<CostItem>(`
    SELECT
      id,
      item_type1,
      item_type2,
      item_nm,
      cost_type,
      pay_dd,
      amt,
      memo,
      use_yn
    FROM my_cost_item
    ORDER BY
      CASE item_type1
        WHEN '5' THEN 1 WHEN '1' THEN 2 WHEN '2' THEN 3
        WHEN '3' THEN 4 WHEN '4' THEN 5 ELSE 9
      END,
      id
  `)
  return rows
}

export async function getAvailableCostItems(yyyymm: string, item_type1: string): Promise<CostItem[]> {
  const pool = getPensionPool()
  const { rows } = await pool.query<CostItem>(`
    SELECT id, item_type1, item_type2, item_nm, cost_type, pay_dd, amt, memo, use_yn
    FROM my_cost_item
    WHERE use_yn = 'Y'
      AND item_type1 = $2
      AND id NOT IN (
        SELECT item_id::int FROM my_cost_info WHERE yyyymm = $1
      )
    ORDER BY id
  `, [yyyymm, item_type1])
  return rows
}

export async function addCostInfoItems(yyyymm: string, itemIds: number[]): Promise<void> {
  if (itemIds.length === 0) return
  const pool = getPensionPool()
  for (const itemId of itemIds) {
    await pool.query(`
      INSERT INTO my_cost_info (yyyymm, item_id, amt)
      SELECT $1, id, amt FROM my_cost_item WHERE id = $2
      ON CONFLICT (yyyymm, item_id) DO NOTHING
    `, [yyyymm, itemId])
  }
}

export async function updateCostItemFields(id: number, data: {
  item_type1?: string
  item_type2?: string | null
  item_nm?: string
  cost_type?: string | null
  pay_dd?: number | null
  amt?: number
  memo?: string | null
}): Promise<void> {
  const pool = getPensionPool()
  const pairs: string[] = []
  const values: unknown[] = [id]
  if (data.item_type1 !== undefined) { pairs.push(`item_type1 = $${values.length + 1}`); values.push(data.item_type1) }
  if (data.item_type2 !== undefined) { pairs.push(`item_type2 = $${values.length + 1}`); values.push(data.item_type2) }
  if (data.item_nm !== undefined)    { pairs.push(`item_nm    = $${values.length + 1}`); values.push(data.item_nm) }
  if (data.cost_type !== undefined)  { pairs.push(`cost_type  = $${values.length + 1}`); values.push(data.cost_type) }
  if (data.pay_dd !== undefined)     { pairs.push(`pay_dd     = $${values.length + 1}`); values.push(data.pay_dd) }
  if (data.amt !== undefined)        { pairs.push(`amt        = $${values.length + 1}`); values.push(data.amt) }
  if (data.memo !== undefined)       { pairs.push(`memo       = $${values.length + 1}`); values.push(data.memo) }
  if (pairs.length === 0) return
  await pool.query(`UPDATE my_cost_item SET ${pairs.join(', ')} WHERE id = $1`, values)
}

export async function deactivateCostItem(id: number): Promise<void> {
  const pool = getPensionPool()
  await pool.query(`UPDATE my_cost_item SET use_yn = 'N' WHERE id = $1`, [id])
}

export async function activateCostItem(id: number): Promise<void> {
  const pool = getPensionPool()
  await pool.query(`UPDATE my_cost_item SET use_yn = 'Y' WHERE id = $1`, [id])
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
