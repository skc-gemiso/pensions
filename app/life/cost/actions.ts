"use server"

import { getPensionPool } from "@/lib/pension-db"
import { decryptField, encryptField, extractLast4 } from "@/lib/card-crypto"

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
  card_id: number | null
}

/** my_card 상세 — 암호문(card_no·cvc·limit_ym)은 클라이언트로 내리지 않는다 */
export type CardMaster = {
  id: number
  card_nm: string
  card_type: string | null
  pay_ymd: string | null
  start_ymd: string | null
  end_ymd: string | null
  memo: string | null
  card_no_last4: string | null
  has_card_no: boolean
  has_limit_ym: boolean
  has_cvc: boolean
}

/** 복호화 요청 가능한 민감 컬럼 */
export type CardSecretField = "card_no" | "limit_ym" | "cvc"

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
  /** 카드 항목(item_type1='4')만 — my_card 에서 JOIN */
  pay_ymd: string | null
  start_ymd: string | null
  end_ymd: string | null
  card_type: string | null
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
      COALESCE(cd.card_nm, i.item_nm) AS item_nm,
      i.cost_type,
      i.pay_dd,
      i.amt,
      i.use_yn,
      i.card_id,
      cd.card_type,
      cd.pay_ymd,
      cd.start_ymd,
      cd.end_ymd,
      c.id          AS info_id,
      c.amt::int    AS amount,
      c.memo,
      COALESCE(p.amt, 0)::int AS prev_amount
    FROM my_cost_info c
    JOIN my_cost_item i ON i.id = c.item_id::int
    LEFT JOIN my_card cd ON cd.id = i.card_id
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
  const res = await pool.query(`
    UPDATE my_cost_info SET amt = $3, memo = $4, updated_at = NOW()
    WHERE yyyymm = $1::text AND item_id = $2::int
  `, [yyyymm, itemId, amount, memo])
  if ((res.rowCount ?? 0) === 0) {
    await pool.query(`
      INSERT INTO my_cost_info (yyyymm, item_id, amt, memo)
      SELECT $1::text, $2::int, $3, $4
      WHERE NOT EXISTS (
        SELECT 1 FROM my_cost_info WHERE yyyymm = $1::text AND item_id = $2::int
      )
    `, [yyyymm, itemId, amount, memo])
  }
}

export async function deleteCostInfo(yyyymm: string, itemId: number): Promise<void> {
  const pool = getPensionPool()
  await pool.query(`
    DELETE FROM my_cost_info WHERE yyyymm = $1::text AND item_id = $2::int
  `, [yyyymm, itemId])
}

export async function addCostItem(data: {
  item_type1: string
  item_type2?: string | null
  item_nm: string
  cost_type?: string | null
  pay_dd?: number | null
  amt?: number
  memo?: string | null
  card_id?: number | null
}): Promise<void> {
  const pool = getPensionPool()
  await pool.query(`
    INSERT INTO my_cost_item (item_type1, item_type2, item_nm, cost_type, pay_dd, amt, memo, card_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    data.item_type1,
    data.item_type2 ?? null,
    data.item_nm,
    data.cost_type ?? null,
    data.pay_dd ?? null,
    data.amt ?? 0,
    data.memo ?? null,
    data.card_id ?? null,
  ])
}

export async function getAllCostItems(): Promise<CostItem[]> {
  const pool = getPensionPool()
  const { rows } = await pool.query<CostItem>(`
    SELECT
      i.id,
      i.item_type1,
      i.item_type2,
      COALESCE(cd.card_nm, i.item_nm) AS item_nm,
      i.cost_type,
      i.pay_dd,
      i.amt,
      i.memo,
      i.use_yn,
      i.card_id
    FROM my_cost_item i
    LEFT JOIN my_card cd ON cd.id = i.card_id
    ORDER BY
      CASE i.item_type1
        WHEN '5' THEN 1 WHEN '1' THEN 2 WHEN '2' THEN 3
        WHEN '3' THEN 4 WHEN '4' THEN 5 ELSE 9
      END,
      i.id
  `)
  return rows
}

export async function getAvailableCostItems(yyyymm: string, item_type1: string): Promise<CostItem[]> {
  const pool = getPensionPool()
  const { rows } = await pool.query<CostItem>(`
    SELECT
      i.id, i.item_type1, i.item_type2,
      COALESCE(cd.card_nm, i.item_nm) AS item_nm,
      i.cost_type, i.pay_dd, i.amt, i.memo, i.use_yn, i.card_id
    FROM my_cost_item i
    LEFT JOIN my_card cd ON cd.id = i.card_id
    WHERE i.use_yn = 'Y'
      AND i.item_type1 = $2
      AND i.id NOT IN (
        SELECT item_id::int FROM my_cost_info WHERE yyyymm = $1
      )
    ORDER BY i.id
  `, [yyyymm, item_type1])
  return rows
}

export async function addCostInfoItems(yyyymm: string, itemIds: number[]): Promise<void> {
  if (itemIds.length === 0) return
  const pool = getPensionPool()
  for (const itemId of itemIds) {
    await pool.query(`
      INSERT INTO my_cost_info (yyyymm, item_id, amt)
      SELECT $1::text, id, amt FROM my_cost_item WHERE id = $2::int
        AND NOT EXISTS (
          SELECT 1 FROM my_cost_info WHERE yyyymm = $1::text AND item_id = $2::int
        )
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
  card_id?: number | null
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
  if (data.card_id !== undefined)    { pairs.push(`card_id    = $${values.length + 1}`); values.push(data.card_id) }
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

// ── 카드 상세 마스터 (my_card) ────────────────────────────────────────────────

const CARD_MASTER_COLUMNS = `
  id, card_nm, card_type, pay_ymd, start_ymd, end_ymd, memo, card_no_last4,
  (card_no  IS NOT NULL AND card_no  <> '') AS has_card_no,
  (limit_ym IS NOT NULL AND limit_ym <> '') AS has_limit_ym,
  (cvc      IS NOT NULL AND cvc      <> '') AS has_cvc
`

export async function getCards(): Promise<CardMaster[]> {
  const pool = getPensionPool()
  const { rows } = await pool.query<CardMaster>(`
    SELECT ${CARD_MASTER_COLUMNS}
    FROM my_card
    ORDER BY sort NULLS LAST, id
  `)
  return rows
}

export async function getCardMaster(cardId: number): Promise<CardMaster | null> {
  const pool = getPensionPool()
  const { rows } = await pool.query<CardMaster>(`
    SELECT ${CARD_MASTER_COLUMNS} FROM my_card WHERE id = $1
  `, [cardId])
  return rows[0] ?? null
}

/**
 * 카드 상세 수정. card_no·limit_ym·cvc 는 넘어온 경우에만 암호화해서 저장하고,
 * card_no 가 바뀌면 표시용 card_no_last4 도 함께 갱신한다.
 */
export async function updateCardMaster(cardId: number, data: {
  card_nm?: string
  card_type?: string | null
  pay_ymd?: string | null
  start_ymd?: string | null
  end_ymd?: string | null
  memo?: string | null
  card_no?: string | null
  limit_ym?: string | null
  cvc?: string | null
}): Promise<void> {
  const pool = getPensionPool()
  const pairs: string[] = []
  const values: unknown[] = [cardId]
  const set = (col: string, v: unknown) => { pairs.push(`${col} = $${values.length + 1}`); values.push(v) }

  if (data.card_nm !== undefined)   set("card_nm",   data.card_nm)
  if (data.card_type !== undefined) set("card_type", data.card_type)
  if (data.pay_ymd !== undefined)   set("pay_ymd",   data.pay_ymd)
  if (data.start_ymd !== undefined) set("start_ymd", data.start_ymd)
  if (data.end_ymd !== undefined)   set("end_ymd",   data.end_ymd)
  if (data.memo !== undefined)      set("memo",      data.memo)
  if (data.limit_ym !== undefined)  set("limit_ym",  encryptField(data.limit_ym))
  if (data.cvc !== undefined)       set("cvc",       encryptField(data.cvc))
  if (data.card_no !== undefined) {
    // card_no 는 PK(NOT NULL) — 빈 값으로 지울 수 없다
    if (!data.card_no) throw new Error("카드번호는 비울 수 없습니다.")
    set("card_no", encryptField(data.card_no))
    set("card_no_last4", extractLast4(data.card_no))
  }
  if (pairs.length === 0) return

  await pool.query(`UPDATE my_card SET ${pairs.join(", ")} WHERE id = $1`, values)
}

/** [보기] 클릭 시에만 호출 — 지정한 컬럼 1개를 복호화해 반환 */
export async function revealCardSecret(
  cardId: number,
  field: CardSecretField
): Promise<string | null> {
  const allowed: CardSecretField[] = ["card_no", "limit_ym", "cvc"]
  if (!allowed.includes(field)) throw new Error(`복호화할 수 없는 컬럼입니다: ${field}`)

  const pool = getPensionPool()
  const { rows } = await pool.query<Record<string, string | null>>(
    `SELECT ${field} FROM my_card WHERE id = $1`,
    [cardId]
  )
  if (rows.length === 0) return null
  return decryptField(rows[0][field])
}

/** my_cost_item 카드 항목 ↔ my_card 연결·해제 */
export async function linkCardToItem(itemId: number, cardId: number | null): Promise<void> {
  const pool = getPensionPool()
  await pool.query(
    `UPDATE my_cost_item SET card_id = $2, updated_at = NOW() WHERE id = $1`,
    [itemId, cardId]
  )
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

export async function copyFromMonth(targetYyyymm: string, sourceYyyymm: string): Promise<void> {
  const pool = getPensionPool()
  await pool.query(`DELETE FROM my_cost_info WHERE yyyymm = $1::text`, [targetYyyymm])
  await pool.query(`
    INSERT INTO my_cost_info (yyyymm, item_id, amt, memo)
    SELECT $1::text, item_id, amt, memo
    FROM my_cost_info
    WHERE yyyymm = $2::text
  `, [targetYyyymm, sourceYyyymm])
}
