"use server"

import { auth } from "@/auth"
import { getPensionPool } from "@/lib/pension-db"

async function ensureStockTables(db: ReturnType<typeof getPensionPool>) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS my_stock (
      id         SERIAL PRIMARY KEY,
      stock_code VARCHAR(20)  NOT NULL,
      s_date     VARCHAR(8)   NOT NULL,
      cnt        INT          NOT NULL,
      stock_type INT          NOT NULL DEFAULT 1,
      qty        NUMERIC      NOT NULL,
      s_amt      NUMERIC      NOT NULL,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `)
  await db.query(`
    CREATE TABLE IF NOT EXISTS f_stock_amt (
      stock_code VARCHAR(20)  NOT NULL,
      s_date     DATE         NOT NULL,
      stock_type VARCHAR(10),
      amt        NUMERIC,
      finish_yn  VARCHAR(1),
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      PRIMARY KEY (stock_code, s_date)
    )
  `)
}

export type StockTransaction = {
  id: number
  stock_code: string
  s_date: string    // YYYYMMDD
  cnt: number       // 1=매입, 2=매도
  stock_type: number
  qty: number
  s_amt: number
  created_at: string
}

export type StockHolding = {
  stock_code: string
  stock_type: number
  net_qty: number
  avg_buy_price: number
  total_buy_amount: number
}

export type DailyPrice = {
  s_date: string    // YYYY-MM-DD
  amt: number
}

export async function getHoldings(): Promise<StockHolding[]> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()
  await ensureStockTables(db)

  const { rows } = await db.query(`
    SELECT
      stock_code,
      MAX(stock_type) AS stock_type,
      SUM(CASE WHEN cnt = 1 THEN qty ELSE -qty END) AS net_qty,
      SUM(CASE WHEN cnt = 1 THEN qty * s_amt ELSE 0 END)
        / NULLIF(SUM(CASE WHEN cnt = 1 THEN qty ELSE 0 END), 0) AS avg_buy_price
    FROM my_stock
    GROUP BY stock_code
    HAVING SUM(CASE WHEN cnt = 1 THEN qty ELSE -qty END) > 0
    ORDER BY stock_code
  `)

  return rows.map((r) => {
    const net_qty       = Number(r.net_qty)
    const avg_buy_price = Number(r.avg_buy_price)
    return {
      stock_code:       r.stock_code,
      stock_type:       Number(r.stock_type),
      net_qty,
      avg_buy_price,
      total_buy_amount: Math.round(net_qty * avg_buy_price),
    }
  })
}

export async function getTransactions(stockCode?: string): Promise<StockTransaction[]> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()
  await ensureStockTables(db)

  const { rows } = stockCode
    ? await db.query(
        `SELECT id, stock_code, s_date, cnt, stock_type, qty, s_amt, created_at
         FROM my_stock WHERE stock_code = $1
         ORDER BY s_date DESC, id DESC`,
        [stockCode]
      )
    : await db.query(
        `SELECT id, stock_code, s_date, cnt, stock_type, qty, s_amt, created_at
         FROM my_stock ORDER BY s_date DESC, id DESC`
      )

  return rows.map((r) => ({
    id:         r.id,
    stock_code: r.stock_code,
    s_date:     r.s_date,
    cnt:        Number(r.cnt),
    stock_type: Number(r.stock_type),
    qty:        Number(r.qty),
    s_amt:      Number(r.s_amt),
    created_at: (r.created_at as Date).toISOString(),
  }))
}

export async function addTransaction(data: {
  stock_code: string
  s_date: string
  cnt: number
  stock_type: number
  qty: number
  s_amt: number
}): Promise<void> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()
  await ensureStockTables(db)

  await db.query(
    `INSERT INTO my_stock (stock_code, s_date, cnt, stock_type, qty, s_amt)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [data.stock_code.trim().toUpperCase(), data.s_date, data.cnt, data.stock_type, data.qty, data.s_amt]
  )
}

export async function deleteTransaction(id: number): Promise<void> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()
  await db.query(`DELETE FROM my_stock WHERE id = $1`, [id])
}

export async function getDailyPrices(stockCode: string): Promise<DailyPrice[]> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()
  await ensureStockTables(db)

  const { rows } = await db.query(
    `SELECT TO_CHAR(s_date, 'YYYY-MM-DD') AS s_date, amt
     FROM f_stock_amt
     WHERE stock_code = $1
     ORDER BY s_date ASC`,
    [stockCode]
  )
  return rows.map((r) => ({ s_date: r.s_date, amt: Number(r.amt) }))
}

export async function fetchAndSaveNaverPrices(stockCode: string, stockType: number): Promise<number> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()
  await ensureStockTables(db)

  // Naver mobile candle API (server-side fetch, no CORS issue)
  const res = await fetch(
    `https://m.stock.naver.com/api/stock/${stockCode}/candle/day?count=500`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://m.stock.naver.com",
      },
    }
  )
  if (!res.ok) throw new Error(`Naver API error: ${res.status}`)

  const data = await res.json()
  if (!Array.isArray(data)) throw new Error("Unexpected Naver API response")

  let saved = 0
  for (const d of data) {
    const dateStr = String(d.localDate ?? "")
    if (dateStr.length !== 8) continue
    const isoDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
    const close   = Number(String(d.closePrice ?? "0").replace(/,/g, ""))
    if (!close) continue

    await db.query(
      `INSERT INTO f_stock_amt (stock_code, s_date, stock_type, amt, finish_yn)
       VALUES ($1, $2::date, $3, $4, 'Y')
       ON CONFLICT (stock_code, s_date) DO UPDATE
         SET amt = EXCLUDED.amt, stock_type = EXCLUDED.stock_type, updated_at = NOW()`,
      [stockCode, isoDate, String(stockType), close]
    )
    saved++
  }
  return saved
}
