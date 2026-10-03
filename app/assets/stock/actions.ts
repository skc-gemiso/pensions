"use server"

import { getPensionPool } from "@/lib/pension-db"
import { requireAdmin } from "@/lib/guard"
import { syncDividendDeposits, syncAllDividendDeposits, divMemo } from "@/lib/dividend-deposits"
import { accumSettingsFromEnv } from "@/lib/settings"
import { planSnapshot, applySnapshot, type SnapshotPlan } from "@/lib/accum-snapshot"

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
  // 투자 자금 출처 (1=현금, 2=분배금) — 기존 행은 전부 현금으로 채워진다
  await db.query(`ALTER TABLE my_stock ADD COLUMN IF NOT EXISTS fund_type INT NOT NULL DEFAULT 1`)
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

// `my_account.account_type` — 1=은행, 2=증권
// "use server" 파일은 async 함수만 export 할 수 있어 상수는 모듈 내부에 둔다
const ACCOUNT_TYPE_STOCK = "2"

/**
 * 계좌 목록.
 *
 * 이 화면이 다루는 매입/매도·적립·예수금은 전부 증권계좌 일이라 **기본은 증권계좌만**이다.
 * 은행계좌(급여·병원비 등)가 섞이면 매입 계좌 선택에서 잘못 고르기 쉽다.
 * `includeBank` 를 주면 전체를 돌려준다.
 */
export async function getAccounts(includeBank = false): Promise<Account[]> {
  await requireAdmin()

  const db = getPensionPool()
  const { rows } = await db.query(
    `SELECT account_no, account_nm
     FROM my_account
     WHERE ($1::boolean OR account_type = $2)
     ORDER BY account_type, sort, account_no`,
    [includeBank, ACCOUNT_TYPE_STOCK]
  )
  return rows.map((r) => ({ account_no: r.account_no, account_nm: r.account_nm }))
}

export async function getAccountInfo(): Promise<AccountInfo[]> {
  await requireAdmin()

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
  fund_type: number // 1=현금, 2=분배금 (매입 행에만 의미)
  qty: number       // 양수=매입, 음수=매도
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
  total_buy_amount_cash: number // 위 금액 중 현금(fund_type=1) 매입 몫 — 잔고 비례
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
  await requireAdmin()

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
      SUM(CASE WHEN ms.qty > 0 THEN ms.qty * ms.s_amt ELSE 0 END) AS gross_buy_amt,
      SUM(CASE WHEN ms.qty > 0 AND ms.fund_type = 1 THEN ms.qty * ms.s_amt ELSE 0 END) AS cash_buy_amt,
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
    const total_buy     = Math.round(net_qty * raw_avg)
    // 현금 매입 비중을 총 매입금액에 그대로 곱한다 (잔고 비례) → 매도가 있어도 총 매입금액과 기준이 같다
    const gross_buy_amt = Number(r.gross_buy_amt ?? 0)
    const cash_buy_amt  = Number(r.cash_buy_amt  ?? 0)
    const cash_ratio    = gross_buy_amt > 0 ? cash_buy_amt / gross_buy_amt : 1
    return {
      account_no:   r.account_no,
      account_nm:   r.account_nm ?? null,
      stock_code:   r.stock_code,
      stock_type:   Number(r.stock_type),
      net_qty,
      avg_buy_price,
      total_buy_amount: total_buy,
      total_buy_amount_cash: Math.round(total_buy * cash_ratio),
      stock_name:   r.stock_name   ?? null,
      latest_price: r.latest_price != null ? Number(r.latest_price) : null,
      latest_date:  r.latest_date  ?? null,
      prev_price:   r.prev_price   != null ? Number(r.prev_price)   : null,
    }
  })
}

export async function getTransactions(stockCode?: string, accountNo?: string): Promise<StockTransaction[]> {
  await requireAdmin()

  const db = getPensionPool()
  await ensureStockTables(db)

  const { rows } = await db.query(
    `SELECT id, account_no, stock_code, s_date, cnt, stock_type, fund_type, qty, s_amt, created_at
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
    fund_type:  Number(r.fund_type ?? 1),
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
  fund_type: number
  qty: number
  s_amt: number
}): Promise<void> {
  await requireAdmin()

  const db = getPensionPool()
  await ensureStockTables(db)

  const stockCode = data.stock_code.trim().toUpperCase()

  await db.query(
    `INSERT INTO my_stock (account_no, stock_code, s_date, cnt, stock_type, fund_type, qty, s_amt)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [data.account_no, stockCode, data.s_date, data.cnt, data.stock_type, data.fund_type, data.qty, data.s_amt]
  )

  // 매입 → 출금, 매도 → 입금 자동 생성
  // 분배금으로 산 경우도 계좌에서는 똑같이 돈이 빠져나가므로 출금 행은 그대로 만들고 비고로만 구분한다
  const inOut  = data.qty > 0 ? "O" : "I"
  const amt    = Math.abs(data.qty) * data.s_amt
  const memo   = data.qty > 0
    ? `매입${data.fund_type === 2 ? "(분배금)" : ""}: ${stockCode}`
    : `매도: ${stockCode}`

  await db.query(
    `INSERT INTO my_account_info (account_no, trade_date, in_out, amt, memo)
     VALUES ($1, $2, $3, $4, $5)`,
    [data.account_no, data.s_date, inOut, amt, memo]
  )
}

/**
 * 거래 내역 1건 수정.
 * 저장 때 자동 생성한 my_account_info 행은 이 거래와 이어주는 키가 없어 함께 고치지 않는다.
 * 계좌 입출금은 `계좌 내역` 탭에서 따로 맞춘다 (삭제도 같은 방식).
 */
export async function updateTransaction(data: {
  id: number
  account_no: string
  stock_code: string
  s_date: string
  cnt: number
  stock_type: number
  fund_type: number
  qty: number
  s_amt: number
}): Promise<void> {
  await requireAdmin()

  const db = getPensionPool()
  await ensureStockTables(db)

  const { rowCount } = await db.query(
    `UPDATE my_stock
        SET account_no = $2, stock_code = $3, s_date = $4, cnt = $5,
            stock_type = $6, fund_type = $7, qty = $8, s_amt = $9, updated_at = NOW()
      WHERE id = $1`,
    [
      data.id, data.account_no, data.stock_code.trim().toUpperCase(), data.s_date,
      data.cnt, data.stock_type, data.fund_type, data.qty, data.s_amt,
    ]
  )
  if (!rowCount) throw new Error(`수정할 거래 내역이 없습니다 (id=${data.id}).`)
}

export async function addAccountInfo(data: {
  account_no: string
  trade_date: string
  in_out: string
  amt: number
  memo: string
}): Promise<void> {
  await requireAdmin()

  const db = getPensionPool()
  await db.query(
    `INSERT INTO my_account_info (account_no, trade_date, in_out, amt, memo)
     VALUES ($1, $2, $3, $4, $5)`,
    [data.account_no, data.trade_date, data.in_out, data.amt, data.memo]
  )
}

export async function deleteTransaction(id: number): Promise<void> {
  await requireAdmin()

  const db = getPensionPool()
  await db.query(`DELETE FROM my_stock WHERE id = $1`, [id])
}

export type StockListItem = { code: string; name: string; market: string; stock_type: number }

// t_stock_list 검색 — 빈 쿼리 시 default_yn='Y' 인기 종목 반환
export async function searchStockList(q: string): Promise<StockListItem[]> {
  await requireAdmin()

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
  await requireAdmin()

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
  await requireAdmin()

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

  // 1페이지 60영업일 — 증분이면 2페이지(120일), 최초 수집이면 5페이지(300일)
  const maxPage = maxDateStr ? 2 : 5
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
  await requireAdmin()

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
  await requireAdmin()

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

// ── 분배금 → 계좌 입금 연동 ───────────────────────────────────────────────────
//
// 생성 규칙은 lib/dividend-deposits.ts 에 있다. Cron(인증 없는 서버 내부 호출)도 같은
// 규칙을 써야 하는데, 가드 없는 함수를 이 "use server" 파일에 두면 클라이언트에서
// 호출 가능한 서버 액션이 되어버려 분리했다. 여기에는 admin 가드만 씌운다.

/**
 * 등록된 분배금 전체에 대해 계좌 입금 내역을 다시 만든다 (소급 생성).
 * 배당 팝업의 `[계좌 입금 내역 재생성]` 버튼에서 호출한다.
 */
export async function backfillDividendDeposits(stockCode: string): Promise<{ dividends: number; deposits: number }> {
  await requireAdmin()
  return syncAllDividendDeposits(getPensionPool(), stockCode)
}

/**
 * 분배금 1건 등록. PK가 (stock_code, ref_date) 라 같은 지급기준일은 중복 등록할 수 없다.
 * 덮어쓰면 기존 이력이 조용히 바뀌므로 UPSERT 대신 예외를 던진다.
 */
export async function addEtfDividend(data: {
  stock_code: string
  ref_date: string           // YYYY-MM-DD
  pay_date?: string | null
  dist_rate?: number | null
  dist_amt?: number | null
  tax_base_amt?: number | null
}): Promise<void> {
  await requireAdmin()

  if (!data.stock_code) throw new Error("종목코드가 없습니다.")
  if (!data.ref_date) throw new Error("지급기준일을 입력하세요.")

  const db = getPensionPool()
  const { rows } = await db.query(
    `SELECT 1 FROM t_etf_dividend WHERE stock_code = $1 AND ref_date = $2::date`,
    [data.stock_code, data.ref_date]
  )
  if (rows.length > 0) {
    throw new Error(`이미 등록된 지급기준일입니다 (${data.ref_date}).`)
  }

  await db.query(
    `INSERT INTO t_etf_dividend
       (stock_code, ref_date, pay_date, dist_rate, dist_amt, tax_base_amt)
     VALUES ($1, $2::date, $3::date, $4, $5, $6)`,
    [
      data.stock_code,
      data.ref_date,
      data.pay_date || null,
      data.dist_rate ?? null,
      data.dist_amt ?? null,
      data.tax_base_amt ?? null,
    ]
  )

  await syncDividendDeposits(db, data.stock_code, data.ref_date)
}

/**
 * 분배금 1건 수정. orig_ref_date 로 행을 찾고 지급기준일(PK)까지 바꿀 수 있다.
 * 바꾼 지급기준일이 다른 행과 겹치면 덮어쓰지 않고 예외를 던진다.
 */
export async function updateEtfDividend(data: {
  stock_code: string
  orig_ref_date: string      // YYYY-MM-DD 수정 전 지급기준일
  ref_date: string           // YYYY-MM-DD
  pay_date?: string | null
  dist_rate?: number | null
  dist_amt?: number | null
  tax_base_amt?: number | null
}): Promise<void> {
  await requireAdmin()

  if (!data.stock_code) throw new Error("종목코드가 없습니다.")
  if (!data.orig_ref_date) throw new Error("수정할 지급기준일이 없습니다.")
  if (!data.ref_date) throw new Error("지급기준일을 입력하세요.")

  const db = getPensionPool()
  if (data.ref_date !== data.orig_ref_date) {
    const { rows } = await db.query(
      `SELECT 1 FROM t_etf_dividend WHERE stock_code = $1 AND ref_date = $2::date`,
      [data.stock_code, data.ref_date]
    )
    if (rows.length > 0) {
      throw new Error(`이미 등록된 지급기준일입니다 (${data.ref_date}).`)
    }
  }

  const { rowCount } = await db.query(
    `UPDATE t_etf_dividend
        SET ref_date = $3::date, pay_date = $4::date, dist_rate = $5,
            dist_amt = $6, tax_base_amt = $7, updated_at = NOW()
      WHERE stock_code = $1 AND ref_date = $2::date`,
    [
      data.stock_code,
      data.orig_ref_date,
      data.ref_date,
      data.pay_date || null,
      data.dist_rate ?? null,
      data.dist_amt ?? null,
      data.tax_base_amt ?? null,
    ]
  )
  if (!rowCount) throw new Error(`수정할 분배금이 없습니다 (${data.orig_ref_date}).`)

  // 지급기준일이 바뀌면 비고 키도 바뀐다 — 옛 키로 만든 입금 행을 먼저 지운다
  if (data.ref_date !== data.orig_ref_date) {
    await db.query(`DELETE FROM my_account_info WHERE memo = $1`, [divMemo(data.stock_code, data.orig_ref_date)])
  }
  await syncDividendDeposits(db, data.stock_code, data.ref_date)
}

type SiseRow = { date: string; close: number; e_amt: number; e_rate: number; e_trade: number }

// 1페이지 = 60영업일. 100 을 넘기면 네이버가 빈 응답을 준다
const NAVER_PAGE_SIZE = 60

const _num = (v: unknown) => Number(String(v ?? "").replace(/,/g, "")) || 0

/**
 * 네이버 일별 시세 1페이지.
 *
 * 구 `finance.naver.com/item/sise_day.naver` 는 2026-09 부터 HTTP 410 Gone 이라
 * 모바일 JSON API 로 옮겼다. EUC-KR 디코딩과 HTML 파싱이 통째로 사라졌다.
 */
async function _fetchSisePage(code: string, page: number): Promise<SiseRow[]> {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${code}/price?pageSize=${NAVER_PAGE_SIZE}&page=${page}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": `https://m.stock.naver.com/domestic/stock/${code}/total`,
          "Accept": "application/json",
          "Accept-Language": "ko-KR,ko;q=0.9",
        },
      }
    )
    if (!res.ok) return []
    return _parseSiseDay(await res.json())
  } catch {
    return []
  }
}

/**
 * 일별 시세 JSON → SiseRow.
 *
 * 전일대비(`compareToPreviousClosePrice`)는 값 자체에 부호가 들어 있어("-11,000")
 * 구 파서처럼 `em` 태그 class 로 부호를 추론할 필요가 없다.
 * 등락률은 네이버 공시값(`fluctuationsRatio`)이 있지만 쓰지 않는다 —
 * 이미 쌓인 데이터가 아래 공식으로 계산된 값이라 기준을 맞춘다.
 */
function _parseSiseDay(data: unknown): SiseRow[] {
  if (!Array.isArray(data)) return []
  const result: SiseRow[] = []
  for (const d of data) {
    const date = String(d?.localTradedAt ?? "")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const close = _num(d.closePrice)
    if (!close) continue

    const e_amt   = _num(d.compareToPreviousClosePrice)
    const e_trade = _num(d.accumulatedTradingVolume)

    // 등락률: (전일대비 / 전일종가) × 100, 소수점 2자리
    const prevClose = close - e_amt
    const e_rate    = prevClose > 0 ? Math.round(e_amt / prevClose * 10000) / 100 : 0

    result.push({ date, close, e_amt, e_rate, e_trade })
  }
  return result
}


// ── 적립 (주식모으기) ─────────────────────────────────────────────────────────

export type AccumBaseDate = {
  div_code:   string            // 그 분배금을 주는 종목 (적립 종목과 다를 수 있다)
  div_name:   string | null
  ref_date:   string            // YYYY-MM-DD 분배금 지급기준일
  base_date:  string            // YYYY-MM-DD 기산일 (ACCUM_BASE_DAY)
  pay_date:   string | null     // YYYY-MM-DD 실지급일
  dist_amt:   number | null     // 주당 분배금
  passed:     boolean           // 기산일이 지났는가
  has_snapshot: boolean         // 그 날짜에 적립 매입 행이 있는가 (스냅샷을 찍었는가)
  qty_at_base: number           // 기산일 기준 누적 수량 (적립 종목)
}

/**
 * 분배금 기산일 정리.
 *
 * 분배금 대상 수량은 **기산일 하루**만 본다. 그 날 수량만 맞으면 분배금이 정확하다.
 * 그래서 "언제 스냅샷을 찍어야 하는가" = "기산일이 언제인가" 다.
 * 지난 기산일에 스냅샷이 없으면 그 달 분배금 수량이 추정으로 남는다 — 그걸 드러낸다.
 *
 * 기준일은 `t_etf_dividend` 에 등록된 **모든 종목**에서 가져온다.
 * 적립 재원이 다른 종목(498400)의 분배금이라 그 입금 시점도 알아야 하기 때문이다.
 * 어느 종목의 기준일인지 헷갈리지 않도록 `div_code` 를 함께 돌려준다.
 * `qty_at_base` 는 언제나 **적립 종목**(ACCUM_STOCK_CODE)의 수량이다.
 */
export async function getAccumBaseDates(limit = 12): Promise<AccumBaseDate[]> {
  await requireAdmin()

  const { accounts, stock_code, base_day } = accumSettingsFromEnv()
  if (!stock_code || accounts.length === 0) return []

  const db = getPensionPool()
  const { rows } = await db.query(
    `WITH refs AS (
       SELECT stock_code, ref_date, pay_date, dist_amt
       FROM t_etf_dividend
       ORDER BY ref_date DESC
       LIMIT $1
     )
     SELECT
       r.stock_code AS div_code,
       (SELECT COALESCE(sl.stock_short_name, sl.stock_name)
          FROM t_stock_list sl WHERE sl.stock_code = r.stock_code) AS div_name,
       TO_CHAR(r.ref_date, 'YYYY-MM-DD') AS ref_date,
       TO_CHAR(r.pay_date, 'YYYY-MM-DD') AS pay_date,
       r.dist_amt,
       TO_CHAR(r.ref_date, 'YYYYMM') || LPAD($2::text, 2, '0') AS base_ymd,
       (SELECT COALESCE(SUM(ms.qty), 0)::float8
          FROM my_stock ms
         WHERE ms.stock_code = $3
           AND ms.account_no = ANY($4)
           AND ms.s_date <= TO_CHAR(r.ref_date, 'YYYYMM') || LPAD($2::text, 2, '0')) AS qty_at_base,
       EXISTS (SELECT 1 FROM my_stock ms
                WHERE ms.stock_code = $3
                  AND ms.account_no = ANY($4)
                  AND ms.s_date = TO_CHAR(r.ref_date, 'YYYYMM') || LPAD($2::text, 2, '0')) AS has_snapshot
     FROM refs r
     ORDER BY r.ref_date DESC`,
    [limit, base_day, stock_code, accounts]
  )

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  return rows.map(r => ({
    div_code:   r.div_code,
    div_name:   r.div_name ?? null,
    ref_date:   r.ref_date,
    base_date:  `${r.base_ymd.slice(0,4)}-${r.base_ymd.slice(4,6)}-${r.base_ymd.slice(6,8)}`,
    pay_date:   r.pay_date ?? null,
    dist_amt:   r.dist_amt != null ? Number(r.dist_amt) : null,
    passed:     r.base_ymd <= today,
    has_snapshot: Boolean(r.has_snapshot),
    qty_at_base: Number(r.qty_at_base),
  }))
}

/** 적립 스냅샷 미리보기 — DB 를 바꾸지 않는다 */
export async function previewAccumSnapshot(input: {
  account_no: string
  snap_date: string
  qty: number
  avg_price: number
  balance: number | null
}): Promise<SnapshotPlan> {
  await requireAdmin()

  const { stock_code, base_day } = accumSettingsFromEnv()
  if (!stock_code) throw new Error("ACCUM_STOCK_CODE 가 설정돼 있지 않습니다.")

  return planSnapshot(getPensionPool(), { ...input, stock_code }, base_day)
}

/** 적립 스냅샷 저장 — 미리보기와 같은 계산을 다시 돌려 그대로 반영한다 */
export async function saveAccumSnapshot(input: {
  account_no: string
  snap_date: string
  qty: number
  avg_price: number
  balance: number | null
}): Promise<SnapshotPlan> {
  await requireAdmin()

  const { stock_code, base_day } = accumSettingsFromEnv()
  if (!stock_code) throw new Error("ACCUM_STOCK_CODE 가 설정돼 있지 않습니다.")

  const db = getPensionPool()
  const plan = await planSnapshot(db, { ...input, stock_code }, base_day)
  await applySnapshot(db, plan, input.snap_date)
  return plan
}

export type AccumConfig = {
  stock_code: string
  stock_name: string | null
  accounts: string[]
  daily_limit: number
  base_day: number
  transfer_day: number
  transfer_amount: number
  /** 설정이 비어 있는 이유 — 화면에 그대로 띄운다 */
  missing: string[]
}

/**
 * 적립 설정 조회.
 *
 * 환경 변수는 서버 기동 시 1회만 읽히므로(`next.config.ts` 의 dotenv),
 * 값을 추가하고 재시작하지 않으면 조용히 빈 값이 된다.
 * 그 상태를 화면에 드러내려고 `missing` 을 함께 돌려준다.
 */
export async function getAccumConfig(): Promise<AccumConfig> {
  await requireAdmin()

  const s = accumSettingsFromEnv()
  const missing: string[] = []
  if (!s.stock_code)        missing.push("ACCUM_STOCK_CODE")
  if (s.accounts.length === 0) missing.push("ACCUM_ACCOUNTS")

  let stock_name: string | null = null
  if (s.stock_code) {
    const { rows } = await getPensionPool().query(
      `SELECT COALESCE(stock_short_name, stock_name) AS nm FROM t_stock_list WHERE stock_code = $1`,
      [s.stock_code]
    )
    stock_name = rows[0]?.nm ?? null
  }

  return {
    stock_code: s.stock_code,
    stock_name,
    accounts: s.accounts,
    daily_limit: s.daily_limit,
    base_day: s.base_day,
    transfer_day: s.transfer_day,
    transfer_amount: s.transfer_amount,
    missing,
  }
}
