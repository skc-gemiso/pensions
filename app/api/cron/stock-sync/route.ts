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

async function fetchSisePage(code: string, page: number): Promise<SiseRow[]> {
  try {
    const res = await fetch(
      `https://finance.naver.com/item/sise_day.naver?code=${code}&page=${page}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": `https://finance.naver.com/item/main.naver?code=${code}`,
          "Accept-Language": "ko-KR,ko;q=0.9",
        },
        next: { revalidate: 0 },
      }
    )
    if (!res.ok) return []
    const buf  = await res.arrayBuffer()
    const html = new TextDecoder("euc-kr").decode(buf)
    const result: SiseRow[] = []
    for (const seg of html.split(/<\/tr>/i)) {
      const dateM = seg.match(/(\d{4})\.(\d{2})\.(\d{2})/)
      if (!dateM) continue
      const date  = `${dateM[1]}-${dateM[2]}-${dateM[3]}`
      const numSpans = [...seg.matchAll(/<span class="tah p11">([\d,]+)<\/span>/g)]
      if (!numSpans[0]) continue
      const close = Number(numSpans[0][1].replace(/,/g, ""))
      if (!close) continue
      const e_trade = numSpans[4] ? Number(numSpans[4][1].replace(/,/g, "")) : 0
      let e_amt = 0
      const changeM = seg.match(/<span class="tah p11 (red|blue)[^"]*">\s*([\d,]+)\s*<\/span>/)
      if (changeM) {
        const num = Number(changeM[2].replace(/,/g, ""))
        e_amt = changeM[1] === "blue" ? -num : num
      }
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

async function syncStock(db: ReturnType<typeof getPensionPool>, stockCode: string, stockType: number) {
  const todayStr = new Date().toISOString().slice(0, 10)
  await db.query(`DELETE FROM t_stock_amt WHERE stock_code = $1 AND e_date = $2::date`, [stockCode, todayStr])

  const { rows } = await db.query(
    `SELECT TO_CHAR(MAX(e_date), 'YYYY-MM-DD') AS max_date FROM t_stock_amt WHERE stock_code = $1`,
    [stockCode]
  )
  const maxDateStr: string | null = rows[0]?.max_date ?? null

  const maxPage = maxDateStr ? 6 : 30
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

  if (allPrices.length === 0) return 0

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
  return unique.length
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db = getPensionPool()
  await ensureColumns(db)

  // 수집 대상: t_stock_list default_yn='Y' 전체
  const { rows: stocks } = await db.query(`
    SELECT stock_code,
           CASE WHEN security_type ILIKE '%ETF%' THEN 2 ELSE 1 END AS stock_type
    FROM t_stock_list
    WHERE default_yn = 'Y'
    ORDER BY listed_shares DESC NULLS LAST
  `)

  const results: Record<string, number | string> = {}
  for (const s of stocks) {
    try {
      results[s.stock_code] = await syncStock(db, s.stock_code, Number(s.stock_type))
    } catch (e) {
      results[s.stock_code] = `error: ${e instanceof Error ? e.message : "unknown"}`
    }
  }

  return NextResponse.json({ ok: true, synced: results, at: new Date().toISOString() })
}
