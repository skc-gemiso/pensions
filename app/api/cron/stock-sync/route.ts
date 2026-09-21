import { NextRequest, NextResponse } from "next/server"
import { getPensionPool } from "@/lib/pension-db"

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return (
    req.headers.get("authorization") === `Bearer ${secret}` ||
    req.nextUrl.searchParams.get("secret") === secret
  )
}

type SiseRow = { date: string; close: number; e_amt: number; e_rate: number; e_trade: number }

// 1페이지 = 60영업일. 100 을 넘기면 네이버가 빈 응답을 준다
const NAVER_PAGE_SIZE = 60

const num = (v: unknown) => Number(String(v ?? "").replace(/,/g, "")) || 0

// 구 sise_day.naver 는 2026-09 부터 HTTP 410 Gone → 모바일 JSON API 로 교체
// 전일대비는 값에 부호가 들어 있고(-11,000), 등락률은 기존 데이터와 기준을 맞추려 직접 계산한다
async function fetchSisePage(code: string, page: number): Promise<SiseRow[]> {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${code}/price?pageSize=${NAVER_PAGE_SIZE}&page=${page}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": `https://m.stock.naver.com/domestic/stock/${code}/total`,
          "Accept": "application/json",
          "Accept-Language": "ko-KR,ko;q=0.9",
        },
        next: { revalidate: 0 },
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    const result: SiseRow[] = []
    for (const d of data) {
      const date = String(d?.localTradedAt ?? "")
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      const close = num(d.closePrice)
      if (!close) continue
      const e_amt     = num(d.compareToPreviousClosePrice)
      const e_trade   = num(d.accumulatedTradingVolume)
      const prevClose = close - e_amt
      const e_rate    = prevClose > 0 ? Math.round(e_amt / prevClose * 10000) / 100 : 0
      result.push({ date, close, e_amt, e_rate, e_trade })
    }
    return result
  } catch {
    return []
  }
}

async function ensureColumns(db: ReturnType<typeof getPensionPool>) {
  await db.query(`ALTER TABLE t_stock_amt ADD COLUMN IF NOT EXISTS amt      NUMERIC`)
  await db.query(`ALTER TABLE t_stock_amt ADD COLUMN IF NOT EXISTS finish_yn VARCHAR(1)`)
  await db.query(`ALTER TABLE t_stock_amt ADD COLUMN IF NOT EXISTS e_amt    NUMERIC`)
  await db.query(`ALTER TABLE t_stock_amt ADD COLUMN IF NOT EXISTS e_rate   NUMERIC`)
  await db.query(`ALTER TABLE t_stock_amt ADD COLUMN IF NOT EXISTS e_trade  NUMERIC`)
}

async function syncStock(db: ReturnType<typeof getPensionPool>, stockCode: string) {
  const todayStr = new Date().toISOString().slice(0, 10)
  await db.query(`DELETE FROM t_stock_amt WHERE stock_code = $1 AND e_date = $2::date`, [stockCode, todayStr])

  const { rows } = await db.query(
    `SELECT TO_CHAR(MAX(e_date), 'YYYY-MM-DD') AS max_date FROM t_stock_amt WHERE stock_code = $1`,
    [stockCode]
  )
  const maxDateStr: string | null = rows[0]?.max_date ?? null

  // 1페이지 60영업일 — 증분이면 2페이지(120일), 최초 수집이면 5페이지(300일)
  const maxPage = maxDateStr ? 2 : 5
  const allPrices: SiseRow[] = []
  let done = false

  for (let batchStart = 1; batchStart <= maxPage && !done; batchStart += 3) {
    const pages = Array.from({ length: 3 }, (_, i) => batchStart + i).filter(p => p <= maxPage)
    const batchPrices = (await Promise.all(pages.map(p => fetchSisePage(stockCode, p)))).flat()
    if (batchPrices.length === 0) break
    for (const p of batchPrices) {
      if (maxDateStr && p.date <= maxDateStr) { done = true; break }
      allPrices.push(p)
    }
  }

  const seen = new Set<string>()
  const unique = allPrices.filter(p => { if (seen.has(p.date)) return false; seen.add(p.date); return true })

  for (const p of unique) {
    await db.query(
      `INSERT INTO t_stock_amt (e_date, stock_code, e_amt, c_amt, e_rate, e_trade, finish_yn)
       VALUES ($1::date, $2, $3, $4, $5, $6, 'Y')
       ON CONFLICT (e_date, stock_code) DO UPDATE
         SET e_amt = EXCLUDED.e_amt, c_amt = EXCLUDED.c_amt, e_rate = EXCLUDED.e_rate,
             e_trade = EXCLUDED.e_trade, updated_at = NOW()`,
      [p.date, stockCode, p.close, p.e_amt, p.e_rate, p.e_trade]
    )
  }

  return unique.length || 1
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db = getPensionPool()
  await ensureColumns(db)

  // 수집 대상: t_stock_list default_yn='Y' 전체
  const { rows: stocks } = await db.query(`
    SELECT stock_code
    FROM t_stock_list
    WHERE default_yn = 'Y'
    ORDER BY listed_shares DESC NULLS LAST
  `)

  const results: Record<string, number | string> = {}
  for (const s of stocks) {
    try {
      results[s.stock_code] = await syncStock(db, s.stock_code)
    } catch (e) {
      results[s.stock_code] = `error: ${e instanceof Error ? e.message : "unknown"}`
    }
  }

  return NextResponse.json({ ok: true, synced: results, at: new Date().toISOString() })
}
