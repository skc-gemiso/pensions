"use server"

import { getPensionPool } from "@/lib/pension-db"
import { deleteFile as storageDeleteFile, getSignedUrl } from "@/lib/supabase-storage"

// ── 타입 ──────────────────────────────────────────────────────────────────────

export type Shopping = {
  id: number
  item_type: string
  category: string
  purchase_date: string | null
  product_nm: string
  card_item_id: number | null
  card_item_nm: string | null
  original_price: number | null
  purchase_price: number | null
  purchase_place: string | null
  content: string | null
  created_at: string
  updated_at: string
}

export type ShoppingFile = {
  id: number
  ref_type: string
  ref_id: number
  file_nm: string
  storage_path: string
  mime_type: string | null
  file_size: number | null
  created_at: string
  signed_url: string
}

export type CardItem = {
  id: number
  item_nm: string
}

// ── 결제수단 ──────────────────────────────────────────────────────────────────

export async function getCardItems(): Promise<CardItem[]> {
  const pool = getPensionPool()
  // 카드명은 my_card.card_nm 기준 (docs/life/cost/cost_task.md 연결 구조)
  const { rows } = await pool.query<CardItem>(
    `SELECT i.id,
            CASE WHEN i.item_type1 = '4' THEN COALESCE(cd.card_nm, i.item_nm)
                 ELSE i.item_nm END AS item_nm
     FROM my_cost_item i
     LEFT JOIN my_card cd ON cd.id = i.card_id
     WHERE i.item_type1 = '4' AND i.use_yn = 'Y'
     ORDER BY cd.sort NULLS LAST, i.id`
  )
  return rows
}

// ── 구매 목록 ─────────────────────────────────────────────────────────────────

export async function getShoppingList(category?: string): Promise<Shopping[]> {
  const pool = getPensionPool()
  const { rows } = await pool.query<Shopping>(
    `SELECT
       s.id, s.item_type, s.category, s.purchase_date::text, s.product_nm,
       s.card_item_id,
       CASE WHEN c.item_type1 = '4' THEN COALESCE(cd.card_nm, c.item_nm)
            ELSE c.item_nm END AS card_item_nm,
       s.original_price, s.purchase_price, s.purchase_place,
       s.content,
       s.created_at::text, s.updated_at::text
     FROM my_shopping s
     LEFT JOIN my_cost_item c ON c.id = s.card_item_id
     LEFT JOIN my_card cd ON cd.id = c.card_id
     WHERE s.item_type = 'shopping' ${category ? "AND s.category = $1" : ""}
     ORDER BY s.purchase_date DESC, s.id DESC
     LIMIT 30`,
    category ? [category] : []
  )
  return rows
}

export async function getShoppingFiles(shoppingId: number): Promise<ShoppingFile[]> {
  const pool = getPensionPool()
  const { rows } = await pool.query<Omit<ShoppingFile, "signed_url">>(
    `SELECT id, ref_type, ref_id, file_nm, storage_path, mime_type, file_size, created_at::text
     FROM my_shopping_file WHERE ref_type = 'shopping' AND ref_id = $1 ORDER BY id`,
    [shoppingId]
  )
  const files: ShoppingFile[] = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      signed_url: await getSignedUrl(r.storage_path),
    }))
  )
  return files
}

export async function addShopping(data: {
  category: string
  purchase_date: string
  product_nm: string
  card_item_id?: number | null
  original_price?: number | null
  purchase_price?: number | null
  purchase_place?: string | null
  content?: string | null
}): Promise<number> {
  const pool = getPensionPool()
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO my_shopping
       (item_type, category, purchase_date, product_nm, card_item_id, original_price, purchase_price, purchase_place, content)
     VALUES ('shopping', $1, $2::date, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      data.category,
      data.purchase_date,
      data.product_nm,
      data.card_item_id ?? null,
      data.original_price ?? null,
      data.purchase_price ?? null,
      data.purchase_place ?? null,
      data.content ?? null,
    ]
  )
  return rows[0].id
}

export async function updateShopping(
  id: number,
  data: Partial<{
    category: string
    purchase_date: string
    product_nm: string
    card_item_id: number | null
    original_price: number | null
    purchase_price: number | null
    purchase_place: string | null
    content: string | null
  }>
): Promise<void> {
  const pool = getPensionPool()
  const pairs: string[] = []
  const values: unknown[] = [id]
  const set = (col: string, v: unknown) => { pairs.push(`${col} = $${values.length + 1}`); values.push(v) }
  if (data.category !== undefined)       set("category",       data.category)
  if (data.purchase_date !== undefined)  set("purchase_date",  data.purchase_date)
  if (data.product_nm !== undefined)     set("product_nm",     data.product_nm)
  if (data.card_item_id !== undefined)   set("card_item_id",   data.card_item_id)
  if (data.original_price !== undefined) set("original_price", data.original_price)
  if (data.purchase_price !== undefined) set("purchase_price", data.purchase_price)
  if (data.purchase_place !== undefined) set("purchase_place", data.purchase_place)
  if (data.content !== undefined)        set("content",        data.content)
  if (pairs.length === 0) return
  pairs.push(`updated_at = NOW()`)
  await pool.query(`UPDATE my_shopping SET ${pairs.join(", ")} WHERE id = $1 AND item_type = 'shopping'`, values)
}

export async function deleteShopping(id: number): Promise<void> {
  const pool = getPensionPool()
  const { rows } = await pool.query<{ storage_path: string }>(
    `SELECT storage_path FROM my_shopping_file WHERE ref_type = 'shopping' AND ref_id = $1`,
    [id]
  )
  await Promise.all(rows.map((r) => storageDeleteFile(r.storage_path).catch(() => {})))
  await pool.query(`DELETE FROM my_shopping_file WHERE ref_type = 'shopping' AND ref_id = $1`, [id])
  await pool.query(`DELETE FROM my_shopping WHERE id = $1 AND item_type = 'shopping'`, [id])
}

// ── 참고 자료 ─────────────────────────────────────────────────────────────────

export async function getRefList(): Promise<Shopping[]> {
  const pool = getPensionPool()
  const { rows } = await pool.query<Shopping>(
    `SELECT
       id, item_type, category, NULL AS purchase_date, product_nm,
       NULL::int AS card_item_id, NULL AS card_item_nm,
       original_price, NULL::int AS purchase_price, NULL AS purchase_place,
       content, created_at::text, updated_at::text
     FROM my_shopping
     WHERE item_type = 'ref'
     ORDER BY created_at DESC
     LIMIT 30`
  )
  return rows
}

export async function getRefFiles(refId: number): Promise<ShoppingFile[]> {
  const pool = getPensionPool()
  const { rows } = await pool.query<Omit<ShoppingFile, "signed_url">>(
    `SELECT id, ref_type, ref_id, file_nm, storage_path, mime_type, file_size, created_at::text
     FROM my_shopping_file WHERE ref_type = 'ref' AND ref_id = $1 ORDER BY id`,
    [refId]
  )
  const files: ShoppingFile[] = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      signed_url: await getSignedUrl(r.storage_path),
    }))
  )
  return files
}

export async function addRef(data: {
  product_nm: string
  purchase_place?: string | null
  original_price?: number | null
  content?: string | null
}): Promise<number> {
  const pool = getPensionPool()
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO my_shopping (item_type, category, product_nm, purchase_place, original_price, content)
     VALUES ('ref', 'ref', $1, $2, $3, $4) RETURNING id`,
    [data.product_nm, data.purchase_place ?? null, data.original_price ?? null, data.content ?? null]
  )
  return rows[0].id
}

export async function updateRef(
  id: number,
  data: Partial<{
    product_nm: string
    purchase_place: string | null
    original_price: number | null
    content: string | null
  }>
): Promise<void> {
  const pool = getPensionPool()
  const pairs: string[] = []
  const values: unknown[] = [id]
  const set = (col: string, v: unknown) => { pairs.push(`${col} = $${values.length + 1}`); values.push(v) }
  if (data.product_nm !== undefined)     set("product_nm",     data.product_nm)
  if (data.purchase_place !== undefined) set("purchase_place", data.purchase_place)
  if (data.original_price !== undefined) set("original_price", data.original_price)
  if (data.content !== undefined)        set("content",        data.content)
  if (pairs.length === 0) return
  pairs.push(`updated_at = NOW()`)
  await pool.query(`UPDATE my_shopping SET ${pairs.join(", ")} WHERE id = $1 AND item_type = 'ref'`, values)
}

export async function deleteRef(id: number): Promise<void> {
  const pool = getPensionPool()
  const { rows } = await pool.query<{ storage_path: string }>(
    `SELECT storage_path FROM my_shopping_file WHERE ref_type = 'ref' AND ref_id = $1`,
    [id]
  )
  await Promise.all(rows.map((r) => storageDeleteFile(r.storage_path).catch(() => {})))
  await pool.query(`DELETE FROM my_shopping_file WHERE ref_type = 'ref' AND ref_id = $1`, [id])
  await pool.query(`DELETE FROM my_shopping WHERE id = $1 AND item_type = 'ref'`, [id])
}

// ── 첨부파일 단건 삭제 ────────────────────────────────────────────────────────

export async function deleteShoppingFile(fileId: number): Promise<void> {
  const pool = getPensionPool()
  const { rows } = await pool.query<{ storage_path: string }>(
    `SELECT storage_path FROM my_shopping_file WHERE id = $1`,
    [fileId]
  )
  if (rows.length === 0) return
  await storageDeleteFile(rows[0].storage_path).catch(() => {})
  await pool.query(`DELETE FROM my_shopping_file WHERE id = $1`, [fileId])
}
