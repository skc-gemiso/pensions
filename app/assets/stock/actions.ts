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
  // id 컬럼 및 PRIMARY KEY 보장
  await db.query(`ALTER TABLE my_stock ADD COLUMN IF NOT EXISTS id SERIAL`)
  await db.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'my_stock' AND constraint_type = 'PRIMARY KEY'
      ) THEN
        ALTER TABLE my_stock ADD PRIMARY KEY (id);
      END IF;
    END $$
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS t_stock_amt (
      e_date     DATE         NOT NULL,
      stock_code VARCHAR(20)  NOT NULL,
      stock_type VARCHAR(10),
      e_amt      NUMERIC,
      c_amt      NUMERIC,
      e_rate     NUMERIC,
      e_trade    NUMERIC,
      finish_yn  VARCHAR(1),
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      PRIMARY KEY (e_date, stock_code)
    )
  `)
  // 기존 테이블에 없을 수 있는 컬럼 보장 (e_amt=종가, c_amt=전일대비)
  await db.query(`ALTER TABLE t_stock_amt ADD COLUMN IF NOT EXISTS finish_yn VARCHAR(1)`)
  await db.query(`ALTER TABLE t_stock_amt ADD COLUMN IF NOT EXISTS c_amt    NUMERIC`)
  await db.query(`ALTER TABLE t_stock_amt ADD COLUMN IF NOT EXISTS e_rate   NUMERIC`)
  await db.query(`ALTER TABLE t_stock_amt ADD COLUMN IF NOT EXISTS e_trade  NUMERIC`)
}

export type Account = {
  account_no: string
  account_nm: string
}

export type AccountInfo = {
  id: number
  account_no: string
  account_nm: string | null
  trade_date: string   // YYYYMMDD
  in_out: string       // I=입금, O=출금
  amt: number
  memo: string | null
}

export async function getAccounts(): Promise<Account[]> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()
  const { rows } = await db.query(
    `SELECT account_no, account_nm FROM my_account ORDER BY account_no`
  )
  return rows.map((r) => ({ account_no: r.account_no, account_nm: r.account_nm }))
}

export async function getAccountInfo(): Promise<AccountInfo[]> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()
  const { rows } = await db.query(`
    SELECT
      ai.id,
      ai.account_no,
      ma.account_nm,
      ai.trade_date,
      ai.in_out,
      ai.amt,
      ai.memo
    FROM my_account_info ai
    LEFT JOIN my_account ma ON ma.account_no = ai.account_no
    ORDER BY ai.trade_date DESC, ai.id DESC
  `)
  return rows.map((r) => ({
    id:         r.id,
    account_no: r.account_no,
    account_nm: r.account_nm ?? null,
    trade_date: r.trade_date,
    in_out:     r.in_out,
    amt:        Number(r.amt),
    memo:       r.memo ?? null,
  }))
}

export type StockTransaction = {
  id: number
  account_no: string
  stock_code: string
  s_date: string    // YYYYMMDD
  cnt: number       // 1=매입, 2=매도
  stock_type: number
  qty: number
  s_amt: number
  created_at: string
}

export type StockHolding = {
  account_no: string
  account_nm: string | null
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
  s_date:  string         // YYYY-MM-DD
  amt:     number         // 종가 (DB 컬럼: e_amt)
  c_amt:   number | null  // 전일대비 금액 (DB 컬럼: c_amt)
  e_rate:  number | null  // 등락률 (%)
  e_trade: number | null  // 거래량
}

export async function getHoldings(accountNo?: string): Promise<StockHolding[]> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()
  await ensureStockTables(db)

  const { rows } = await db.query(`
    SELECT
      ms.account_no,
      ma.account_nm,
      ms.stock_code,
      MAX(ms.stock_type) AS stock_type,
      SUM(ms.qty) AS net_qty,
      SUM(CASE WHEN ms.qty > 0 THEN ms.qty * ms.s_amt ELSE 0 END)
        / NULLIF(SUM(CASE WHEN ms.qty > 0 THEN ms.qty ELSE 0 END), 0) AS avg_buy_price,
      (SELECT COALESCE(sl.stock_short_name, sl.stock_name)
         FROM t_stock_list sl WHERE sl.stock_code = ms.stock_code) AS stock_name,
      (SELECT fa.e_amt
         FROM t_stock_amt fa WHERE fa.stock_code = ms.stock_code
         ORDER BY fa.e_date DESC LIMIT 1) AS latest_price,
      (SELECT TO_CHAR(fa.e_date, 'YYYY-MM-DD')
         FROM t_stock_amt fa WHERE fa.stock_code = ms.stock_code
         ORDER BY fa.e_date DESC LIMIT 1) AS latest_date,
      (SELECT fa.e_amt
         FROM t_stock_amt fa WHERE fa.stock_code = ms.stock_code
         ORDER BY fa.e_date DESC LIMIT 1 OFFSET 1) AS prev_price
    FROM my_stock ms
    LEFT JOIN my_account ma ON ma.account_no = ms.account_no
    WHERE ($1::varchar IS NULL OR ms.account_no = $1)
    GROUP BY ms.account_no, ma.account_nm, ms.stock_code
    HAVING SUM(ms.qty) > 0
    ORDER BY ms.account_no, ms.stock_code
  `, [accountNo ?? null])

  return rows.map((r) => {
    const net_qty       = Number(r.net_qty)
    const raw_avg       = Number(r.avg_buy_price)
    const avg_buy_price = Math.floor(raw_avg)
    return {
      account_no:   r.account_no,
      account_nm:   r.account_nm ?? null,
      stock_code:   r.stock_code,
      stock_type:   Number(r.stock_type),
      net_qty,
      avg_buy_price,
      total_buy_amount: Math.round(net_qty * raw_avg),
      stock_name:   r.stock_name   ?? null,
      latest_price: r.latest_price != null ? Number(r.latest_price) : null,
      latest_date:  r.latest_date  ?? null,
      prev_price:   r.prev_price   != null ? Number(r.prev_price)   : null,
    }
  })
}

export async function getTransactions(stockCode?: string, accountNo?: string): Promise<StockTransaction[]> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()
  await ensureStockTables(db)

  const { rows } = await db.query(
    `SELECT id, account_no, stock_code, s_date, cnt, stock_type, qty, s_amt, created_at
     FROM my_stock
     WHERE ($1::varchar IS NULL OR stock_code = $1)
       AND ($2::varchar IS NULL OR account_no  = $2)
     ORDER BY s_date DESC, id DESC`,
    [stockCode ?? null, accountNo ?? null]
  )

  return rows.map((r) => ({
    id:         r.id,
    account_no:  r.account_no  ?? "",
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
  account_no: string
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
    `INSERT INTO my_stock (account_no, stock_code, s_date, cnt, stock_type, qty, s_amt)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [data.account_no, data.stock_code.trim().toUpperCase(), data.s_date, data.cnt, data.stock_type, data.qty, data.s_amt]
  )

  // 매입 → 출금, 매도 → 입금 자동 생성
  const inOut  = data.qty > 0 ? "O" : "I"
  const amt    = Math.abs(data.qty) * data.s_amt
  const memo   = data.qty > 0
    ? `매입: ${data.stock_code.trim().toUpperCase()}`
    : `매도: ${data.stock_code.trim().toUpperCase()}`

  await db.query(
    `INSERT INTO my_account_info (account_no, trade_date, in_out, amt, memo)
     VALUES ($1, $2, $3, $4, $5)`,
    [data.account_no, data.s_date, inOut, amt, memo]
  )
}

export async function addAccountInfo(data: {
  account_no: string
  trade_date: string
  in_out: string
  amt: number
  memo: string
}): Promise<void> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()
  await db.query(
    `INSERT INTO my_account_info (account_no, trade_date, in_out, amt, memo)
     VALUES ($1, $2, $3, $4, $5)`,
    [data.account_no, data.trade_date, data.in_out, data.amt, data.memo]
  )
}

export async function deleteTransaction(id: number): Promise<void> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()
  await db.query(`DELETE FROM my_stock WHERE id = $1`, [id])
}

export type StockListItem = { code: string; name: string; market: string; stock_type: number }

// t_stock_list 검색 — 빈 쿼리 시 default_yn='Y' 인기 종목 반환
export async function searchStockList(q: string): Promise<StockListItem[]> {
  const session = await auth()
  if (!session?.user) return []

  const db = getPensionPool()

  const toStockType = (secType: string | null) =>
    secType && secType.toUpperCase().includes("ETF") ? 2 : 1

  if (!q.trim()) {
    const { rows } = await db.query(
      `SELECT stock_code AS code,
              COALESCE(stock_short_name, stock_name) AS name,
              COALESCE(market_type, '') AS market,
              security_type
       FROM t_stock_list
       WHERE default_yn = 'Y'
       ORDER BY listed_shares DESC NULLS LAST
       LIMIT 20`
    )
    return rows.map((r) => ({ code: r.code, name: r.name, market: r.market, stock_type: toStockType(r.security_type) }))
  }

  const { rows } = await db.query(
    `SELECT stock_code AS code,
            COALESCE(stock_short_name, stock_name) AS name,
            COALESCE(market_type, '') AS market,
            security_type
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
  return rows.map((r) => ({ code: r.code, name: r.name, market: r.market, stock_type: toStockType(r.security_type) }))
}

export async function getDailyPrices(stockCode: string): Promise<DailyPrice[]> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()
  await ensureStockTables(db)

  const { rows } = await db.query(
    `SELECT TO_CHAR(e_date, 'YYYY-MM-DD') AS s_date,
            e_amt AS amt, c_amt, e_rate, e_trade
     FROM t_stock_amt
     WHERE stock_code = $1
     ORDER BY e_date ASC`,
    [stockCode]
  )
  return rows.map((r) => ({
    s_date:  r.s_date,
    amt:     Number(r.amt),
    c_amt:   r.c_amt   != null ? Number(r.c_amt)   : null,
    e_rate:  r.e_rate  != null ? Number(r.e_rate)  : null,
    e_trade: r.e_trade != null ? Number(r.e_trade) : null,
  }))
}

export async function fetchAndSaveNaverPrices(stockCode: string): Promise<number> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()
  await ensureStockTables(db)

  // 오늘 데이터 삭제 → 당일 재수집
  const todayStr = new Date().toISOString().slice(0, 10)
  await db.query(
    `DELETE FROM t_stock_amt WHERE stock_code = $1 AND e_date = $2::date`,
    [stockCode, todayStr]
  )

  // 삭제 후 최종 저장 일자 조회
  const { rows: maxRows } = await db.query(
    `SELECT TO_CHAR(MAX(e_date), 'YYYY-MM-DD') AS max_date FROM t_stock_amt WHERE stock_code = $1`,
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
    // 오늘 sise_day 데이터가 없더라도 실시간 API로 당일 저장 시도
  }

  const seen   = new Set<string>()
  const unique = allPrices.filter(p => { if (seen.has(p.date)) return false; seen.add(p.date); return true })

  let saved = 0
  for (const p of unique) {
    await db.query(
      `INSERT INTO t_stock_amt (e_date, stock_code, e_amt, c_amt, e_rate, e_trade, finish_yn)
       VALUES ($1::date, $2, $3, $4, $5, $6, 'Y')
       ON CONFLICT (e_date, stock_code) DO UPDATE
         SET e_amt = EXCLUDED.e_amt, c_amt = EXCLUDED.c_amt, e_rate = EXCLUDED.e_rate,
             e_trade = EXCLUDED.e_trade, updated_at = NOW()`,
      [p.date, stockCode, p.close, p.e_amt, p.e_rate, p.e_trade]
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

export type MonthlyAccountDiv = {
  ref_date:   string        // YYYY-MM-DD
  account_no: string
  account_nm: string | null
  qty_13th:   number        // 해당 월 13일 기준 보유 수량
  dist_total: number        // qty_13th × dist_amt (반올림)
  tax_total:  number        // qty_13th × tax_base_amt (반올림)
}

// 분배금 지급기준일별 계좌 보유수량(13일 기산)·분배금 조회
// 기산 규칙: 각 지급기준일의 해당 월 13일(YYYYMM13)까지 매입한 수량 합산
export async function getMonthlyDividendByAccount(stockCode: string): Promise<MonthlyAccountDiv[]> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const db = getPensionPool()

  // qty_13th = 해당 기준일의 월 13일까지 누적 순수량 (매입+매도 합산)
  // dist_amt, tax_base_amt 는 TypeScript에서 곱해 dist_total, tax_total 산출
  const { rows } = await db.query(`
    SELECT
      TO_CHAR(d.ref_date, 'YYYY-MM-DD') AS ref_date,
      ms.account_no,
      ma.account_nm,
      SUM(ms.qty)::int AS qty_13th,
      d.dist_amt,
      d.tax_base_amt
    FROM t_etf_dividend d
    JOIN my_stock ms
      ON ms.stock_code = d.stock_code
      AND ms.s_date <= TO_CHAR(d.ref_date, 'YYYYMM') || '13'
    LEFT JOIN my_account ma ON ma.account_no = ms.account_no
    WHERE d.stock_code = $1
    GROUP BY d.ref_date, d.dist_amt, d.tax_base_amt, ms.account_no, ma.account_nm
    HAVING SUM(ms.qty) > 0
    ORDER BY d.ref_date DESC, ms.account_no
  `, [stockCode])

  return rows.map(r => {
    const qty = Number(r.qty_13th)
    return {
      ref_date:   r.ref_date,
      account_no: r.account_no,
      account_nm: r.account_nm ?? null,
      qty_13th:   qty,
      dist_total: Math.round(qty * Number(r.dist_amt)),
      tax_total:  Math.round(qty * Number(r.tax_base_amt)),
    }
  })
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

    // 전일대비: em class="bu_pdn" 이면 음수, bu_pup 이면 양수
    let e_amt = 0
    const emCls   = (seg.match(/<em class="([^"]*)"/)?.[1] ?? "")
    const changeM = seg.match(/<span class="tah p11 [^"]*">\s*([\d,]+)\s*<\/span>/)
    if (changeM) {
      const num = Number(changeM[1].replace(/,/g, ""))
      e_amt = emCls.includes("bu_pdn") ? -num : (emCls.includes("bu_pup") ? num : 0)
    }

    // 등락률 계산: (e_amt / 전일종가) × 100, 소수점 2자리
    const prevClose = close - e_amt
    const e_rate    = prevClose > 0 ? Math.round(e_amt / prevClose * 10000) / 100 : 0

    result.push({ date, close, e_amt, e_rate, e_trade })
  }
  return result
}

