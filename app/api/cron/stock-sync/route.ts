import { NextRequest, NextResponse } from "next/server"
import { getPensionPool } from "@/lib/pension-db"

// Vercel Cron 또는 외부 호출 시 secret 검증
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return (
    req.headers.get("authorization") === `Bearer ${secret}` ||
    req.nextUrl.searchParams.get("secret") === secret
  )
}

async function fetchSisePage(code: string, page: number): Promise<Array<{ date: string; close: number }>> {
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
    const result: Array<{ date: string; close: number }> = []
    for (const seg of html.split(/<\/tr>/i)) {
      const dateM  = seg.match(/(\d{4})\.(\d{2})\.(\d{2})/)
      if (!dateM) continue
      const date   = `${dateM[1]}-${dateM[2]}-${dateM[3]}`
      const priceM = seg.match(/<span class="tah p11">([\d,]+)<\/span>/)
      if (!priceM) continue
      const close  = Number(priceM[1].replace(/,/g, ""))
      if (close > 0) result.push({ date, close })
    }
    return result
  } catch {
    return []
  }
}

async function syncStock(db: ReturnType<typeof getPensionPool>, stockCode: string, stockType: number) {
  const todayStr = new Date().toISOString().slice(0, 10)

  await db.query(`DELETE FROM f_stock_amt WHERE stock_code = $1 AND s_date = $2::date`, [stockCode, todayStr])

  const { rows } = await db.query(
    `SELECT TO_CHAR(MAX(s_date), 'YYYY-MM-DD') AS max_date FROM f_stock_amt WHERE stock_code = $1`,
    [stockCode]
  )
  const maxDateStr: string | null = rows[0]?.max_date ?? null

  const maxPage = maxDateStr ? 6 : 30
  const allPrices: Array<{ date: string; close: number }> = []
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
      `INSERT INTO f_stock_amt (stock_code, s_date, stock_type, amt, finish_yn)
       VALUES ($1, $2::date, $3, $4, 'Y')
       ON CONFLICT (stock_code, s_date) DO UPDATE
         SET amt = EXCLUDED.amt, stock_type = EXCLUDED.stock_type, updated_at = NOW()`,
      [stockCode, p.date, String(stockType), p.close]
    )
  }
  return unique.length
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db = getPensionPool()
  const { rows: holdings } = await db.query(`
    SELECT stock_code, MAX(stock_type) AS stock_type
    FROM my_stock
    GROUP BY stock_code
    HAVING SUM(CASE WHEN cnt = 1 THEN qty ELSE -qty END) > 0
  `)

  const results: Record<string, number | string> = {}
  for (const h of holdings) {
    try {
      results[h.stock_code] = await syncStock(db, h.stock_code, Number(h.stock_type))
    } catch (e) {
      results[h.stock_code] = `error: ${e instanceof Error ? e.message : "unknown"}`
    }
  }

  return NextResponse.json({ ok: true, synced: results, at: new Date().toISOString() })
}
