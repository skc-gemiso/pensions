"use server"

import { auth } from "@/auth"
import { getPensionPool } from "@/lib/pension-db"

export type MarketIndex = {
  name:       string
  price:      number
  change:     number
  changeRate: number
}

export async function getMarketIndices(): Promise<{ kospi: MarketIndex | null; kosdaq: MarketIndex | null }> {
  async function fetchIdx(code: string): Promise<MarketIndex | null> {
    try {
      const res = await fetch(
        `https://m.stock.naver.com/api/index/${code}/basic`,
        { headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://m.stock.naver.com" }, next: { revalidate: 0 } }
      )
      if (!res.ok) return null
      const d = await res.json()
      return {
        name:       String(d.indexName ?? code),
        price:      Number(String(d.closePrice ?? "0").replace(/,/g, "")),
        change:     Number(String(d.compareToPreviousClosePrice ?? "0").replace(/,/g, "")),
        changeRate: Number(String(d.fluctuationsRatio ?? "0").replace(/,/g, "")),
      }
    } catch { return null }
  }
  const [kospi, kosdaq] = await Promise.all([fetchIdx("KOSPI"), fetchIdx("KOSDAQ")])
  return { kospi, kosdaq }
}

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
    CREATE TABLE IF NOT EXISTS t_stock_amt (
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
  await db.query(`ALTER TABLE t_stock_amt ADD COLUMN IF NOT EXISTS e_amt   NUMERIC`)
  await db.query(`ALTER TABLE t_stock_amt ADD COLUMN IF NOT EXISTS e_rate  NUMERIC`)
  await db.query(`ALTER TABLE t_stock_amt ADD COLUMN IF NOT EXISTS e_trade NUMERIC`)
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
  stock_name: string | null
  stock_type: number
  net_qty: number
  avg_buy_price: number
  total_buy_amount: number
  latest_price: number | null   // t_stock_amt 최신 종가
  latest_date:  string | null   // t_stock_amt 최신 기준일 (YYYY-MM-DD)
  prev_price:   number | null   // t_stock_amt 전일 종가 (전일대비 계산용)
}

export type DailyPrice = {
  s_date:  string   // YYYY-MM-DD
  amt:     number
  e_amt:   number | null  // 전일대비 금액
  e_rate:  number | null  // 등락률 (%)
  e_trade: number | null  // 거래량
}

export async function getHoldings(): Promise<StockHolding[]> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()
  await ensureStockTables(db)

  const { rows } = await db.query(`
    SELECT
      ms.stock_code,
      MAX(ms.stock_type) AS stock_type,
      SUM(CASE WHEN ms.cnt = 1 THEN ms.qty ELSE -ms.qty END) AS net_qty,
      SUM(CASE WHEN ms.cnt = 1 THEN ms.qty * ms.s_amt ELSE 0 END)
        / NULLIF(SUM(CASE WHEN ms.cnt = 1 THEN ms.qty ELSE 0 END), 0) AS avg_buy_price,
      (SELECT COALESCE(sl.stock_short_name, sl.stock_name)
         FROM t_stock_list sl WHERE sl.stock_code = ms.stock_code) AS stock_name,
      (SELECT fa.amt
         FROM t_stock_amt fa WHERE fa.stock_code = ms.stock_code
         ORDER BY fa.s_date DESC LIMIT 1) AS latest_price,
      (SELECT TO_CHAR(fa.s_date, 'YYYY-MM-DD')
         FROM t_stock_amt fa WHERE fa.stock_code = ms.stock_code
         ORDER BY fa.s_date DESC LIMIT 1) AS latest_date,
      (SELECT fa.amt
         FROM t_stock_amt fa WHERE fa.stock_code = ms.stock_code
         ORDER BY fa.s_date DESC LIMIT 1 OFFSET 1) AS prev_price
    FROM my_stock ms
    GROUP BY ms.stock_code
    HAVING SUM(CASE WHEN ms.cnt = 1 THEN ms.qty ELSE -ms.qty END) > 0
    ORDER BY ms.stock_code
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
      stock_name:   r.stock_name   ?? null,
      latest_price: r.latest_price != null ? Number(r.latest_price) : null,
      latest_date:  r.latest_date  ?? null,
      prev_price:   r.prev_price   != null ? Number(r.prev_price)   : null,
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
    `SELECT TO_CHAR(s_date, 'YYYY-MM-DD') AS s_date, amt, e_amt, e_rate, e_trade
     FROM t_stock_amt
     WHERE stock_code = $1
     ORDER BY s_date ASC`,
    [stockCode]
  )
  return rows.map((r) => ({
    s_date:  r.s_date,
    amt:     Number(r.amt),
    e_amt:   r.e_amt   != null ? Number(r.e_amt)   : null,
    e_rate:  r.e_rate  != null ? Number(r.e_rate)  : null,
    e_trade: r.e_trade != null ? Number(r.e_trade) : null,
  }))
}

export async function fetchAndSaveNaverPrices(stockCode: string, stockType: number): Promise<number> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()
  await ensureStockTables(db)

  // 오늘 데이터 삭제 → 당일 재수집
  const todayStr = new Date().toISOString().slice(0, 10)
  await db.query(
    `DELETE FROM t_stock_amt WHERE stock_code = $1 AND s_date = $2::date`,
    [stockCode, todayStr]
  )

  // 삭제 후 최종 저장 일자 조회
  const { rows: maxRows } = await db.query(
    `SELECT TO_CHAR(MAX(s_date), 'YYYY-MM-DD') AS max_date FROM t_stock_amt WHERE stock_code = $1`,
    [stockCode]
  )
  const maxDateStr: string | null = maxRows[0]?.max_date ?? null

  // 기존 데이터 있으면 최근 6페이지만, 없으면 전체 30페이지 수집
  const maxPage = maxDateStr ? 6 : 30
  const allPrices: SiseRow[] = []
  let done = false

  for (let batchStart = 1; batchStart <= maxPage && !done; batchStart += 3) {
    const pages = Array.from({ length: 3 }, (_, i) => batchStart + i).filter(p => p <= maxPage)
    const batchPrices = (await Promise.all(pages.map(p => _fetchSisePage(stockCode, p)))).flat()
    if (batchPrices.length === 0) break

    for (const p of batchPrices) {
      if (maxDateStr && p.date <= maxDateStr) { done = true; break }
      allPrices.push(p)
    }
  }

  if (allPrices.length === 0) {
    if (!maxDateStr) throw new Error("네이버 금융에서 주가를 가져올 수 없습니다. 종목코드를 확인하세요.")
    return 0
  }

  const seen   = new Set<string>()
  const unique = allPrices.filter(p => { if (seen.has(p.date)) return false; seen.add(p.date); return true })

  let saved = 0
  for (const p of unique) {
    await db.query(
      `INSERT INTO t_stock_amt (stock_code, s_date, stock_type, amt, e_amt, e_rate, e_trade, finish_yn)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7, 'Y')
       ON CONFLICT (stock_code, s_date) DO UPDATE
         SET amt = EXCLUDED.amt, e_amt = EXCLUDED.e_amt, e_rate = EXCLUDED.e_rate,
             e_trade = EXCLUDED.e_trade, stock_type = EXCLUDED.stock_type, updated_at = NOW()`,
      [stockCode, p.date, String(stockType), p.close, p.e_amt, p.e_rate, p.e_trade]
    )
    saved++
  }
  return saved
}

// t_stock_list default_yn='Y' 기준 수집 대상 목록
export async function getDefaultStockList(): Promise<Array<{ stock_code: string; stock_type: number }>> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()
  const { rows } = await db.query(`
    SELECT stock_code,
           CASE WHEN security_type ILIKE '%ETF%' THEN 2 ELSE 1 END AS stock_type
    FROM t_stock_list
    WHERE default_yn = 'Y'
    ORDER BY listed_shares DESC NULLS LAST
  `)
  return rows.map((r) => ({ stock_code: r.stock_code, stock_type: Number(r.stock_type) }))
}

type SiseRow = { date: string; close: number; e_amt: number; e_rate: number; e_trade: number }

// sise_day.naver 1페이지 스크래핑 (EUC-KR 디코딩 + HTML 파싱)
async function _fetchSisePage(code: string, page: number): Promise<SiseRow[]> {
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

// sise_day HTML 파싱 — 날짜·종가·전일대비·등락률·거래량 추출
// 순수 숫자 span: [종가, 시가, 고가, 저가, 거래량] (등락 컬럼은 <em> 태그 포함으로 불일치)
// 등락 부호: dn.gif / 하락 → 음수, up.gif / 상승 → 양수
function _parseSiseDay(html: string): SiseRow[] {
  const result: SiseRow[] = []
  for (const seg of html.split(/<\/tr>/i)) {
    const dateM = seg.match(/(\d{4})\.(\d{2})\.(\d{2})/)
    if (!dateM) continue
    const date = `${dateM[1]}-${dateM[2]}-${dateM[3]}`

    // 순수 숫자 span (nested 태그 없는 것만 매칭)
    const numSpans = [...seg.matchAll(/<span class="tah p11">([\d,]+)<\/span>/g)]
    if (!numSpans[0]) continue
    const close = Number(numSpans[0][1].replace(/,/g, ""))
    if (!close) continue

    // 거래량: 5번째 순수 숫자 span (index 4)
    const e_trade = numSpans[4] ? Number(numSpans[4][1].replace(/,/g, "")) : 0

    // 전일대비: <em> 태그 내 숫자 + 이미지로 부호 결정
    let e_amt = 0
    const emM = seg.match(/<em[^>]*>([\s\S]*?)<\/em>/i)
    if (emM) {
      const em  = emM[1]
      const numM = em.match(/([\d,]+)/)
      if (numM) {
        const num   = Number(numM[1].replace(/,/g, ""))
        const isNeg = /dn\.gif|하락/.test(em)
        e_amt = isNeg ? -num : num
      }
    }

    // 등락률 계산: (e_amt / 전일종가) × 100, 소수점 2자리
    const prevClose = close - e_amt
    const e_rate    = prevClose > 0 ? Math.round(e_amt / prevClose * 10000) / 100 : 0

    result.push({ date, close, e_amt, e_rate, e_trade })
  }
  return result
}
