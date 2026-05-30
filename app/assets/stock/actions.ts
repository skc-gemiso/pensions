"use server"

import { auth } from "@/auth"
import { getPensionPool } from "@/lib/pension-db"

async function ensureStockTables(db: ReturnType<typeof getPensionPool>) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS my_stock (
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
  // 기존 테이블에 id 컬럼이 없는 경우 추가 (기존 행에도 순차 값 자동 부여)
  await db.query(`ALTER TABLE my_stock ADD COLUMN IF NOT EXISTS id SERIAL`)

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

export type StockListItem = { code: string; name: string; market: string }

// t_stock_list 검색 — 빈 쿼리 시 default_yn='Y' 인기 종목 반환
export async function searchStockList(q: string): Promise<StockListItem[]> {
  const session = await auth()
  if (!session?.user) return []

  const db = getPensionPool()

  if (!q.trim()) {
    const { rows } = await db.query(
      `SELECT stock_code AS code,
              COALESCE(stock_short_name, stock_name) AS name,
              COALESCE(market_type, '') AS market
       FROM t_stock_list
       WHERE default_yn = 'Y'
       ORDER BY listed_shares DESC NULLS LAST
       LIMIT 20`
    )
    return rows.map((r) => ({ code: r.code, name: r.name, market: r.market }))
  }

  const { rows } = await db.query(
    `SELECT stock_code AS code,
            COALESCE(stock_short_name, stock_name) AS name,
            COALESCE(market_type, '') AS market
     FROM t_stock_list
     WHERE stock_code ILIKE $1
        OR stock_short_name ILIKE $1
        OR stock_name ILIKE $1
     ORDER BY
       CASE WHEN stock_code = $2 THEN 0
            WHEN stock_code ILIKE $3 THEN 1
            ELSE 2 END,
       listed_shares DESC NULLS LAST
     LIMIT 20`,
    [`%${q}%`, q.toUpperCase(), `${q.toUpperCase()}%`]
  )
  return rows.map((r) => ({ code: r.code, name: r.name, market: r.market }))
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

  // sise_day.naver HTML 스크래핑 — 10페이지씩 3배치 (≈ 300 거래일)
  const allPrices: Array<{ date: string; close: number }> = []

  for (let batchStart = 1; batchStart <= 30; batchStart += 10) {
    const pages = Array.from({ length: 10 }, (_, i) => batchStart + i)
    const batchResults = await Promise.all(pages.map((p) => _fetchSisePage(stockCode, p)))
    const batchPrices  = batchResults.flat()
    if (batchPrices.length === 0) break
    allPrices.push(...batchPrices)
  }

  if (allPrices.length === 0) throw new Error("네이버 금융에서 주가를 가져올 수 없습니다. 종목코드를 확인하세요.")

  const seen  = new Set<string>()
  const unique = allPrices.filter((p) => { if (seen.has(p.date)) return false; seen.add(p.date); return true })

  let saved = 0
  for (const p of unique) {
    await db.query(
      `INSERT INTO f_stock_amt (stock_code, s_date, stock_type, amt, finish_yn)
       VALUES ($1, $2::date, $3, $4, 'Y')
       ON CONFLICT (stock_code, s_date) DO UPDATE
         SET amt = EXCLUDED.amt, stock_type = EXCLUDED.stock_type, updated_at = NOW()`,
      [stockCode, p.date, String(stockType), p.close]
    )
    saved++
  }
  return saved
}

// sise_day.naver 1페이지 스크래핑 (EUC-KR 디코딩 + HTML 파싱)
async function _fetchSisePage(code: string, page: number): Promise<Array<{ date: string; close: number }>> {
  try {
    const res = await fetch(
      `https://finance.naver.com/item/sise_day.naver?code=${code}&page=${page}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": `https://finance.naver.com/item/main.naver?code=${code}`,
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "ko-KR,ko;q=0.9",
        },
      }
    )
    if (!res.ok) return []
    const buf  = await res.arrayBuffer()
    const html = new TextDecoder("euc-kr").decode(buf)
    return _parseSiseDay(html)
  } catch {
    return []
  }
}

// <tr> 블록에서 날짜 + 종가 추출
// - 날짜: <span class="tah p10 gray03">YYYY.MM.DD</span>
// - 종가: 해당 행의 첫 번째 <span class="tah p11">숫자,숫자</span>
//         (등락 컬럼은 <em> 자식 태그 포함 → 단순 숫자 패턴 불일치)
function _parseSiseDay(html: string): Array<{ date: string; close: number }> {
  const result: Array<{ date: string; close: number }> = []
  for (const seg of html.split(/<\/tr>/i)) {
    const dateM = seg.match(/(\d{4})\.(\d{2})\.(\d{2})/)
    if (!dateM) continue
    const date  = `${dateM[1]}-${dateM[2]}-${dateM[3]}`
    const priceM = seg.match(/<span class="tah p11">([\d,]+)<\/span>/)
    if (!priceM) continue
    const close = Number(priceM[1].replace(/,/g, ""))
    if (close > 0) result.push({ date, close })
  }
  return result
}
