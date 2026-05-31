/**
 * t_stock_list default_yn='Y' 기준 주가 자동 수집 스크립트
 * Usage: node scripts/sync-stock-prices.mjs
 * 환경변수: PENSION_SIM_DB_HOST, PENSION_SIM_DB_PORT, PENSION_SIM_DB_NAME,
 *           PENSION_SIM_DB_USER, PENSION_SIM_DB_PASSWORD
 */
import pg from "pg"

const { Pool } = pg

const pool = new Pool({
  host:     process.env.PENSION_SIM_DB_HOST,
  port:     Number(process.env.PENSION_SIM_DB_PORT ?? 5432),
  database: process.env.PENSION_SIM_DB_NAME,
  user:     process.env.PENSION_SIM_DB_USER,
  password: process.env.PENSION_SIM_DB_PASSWORD,
  ssl:      process.env.PENSION_SIM_DB_SSL === "false" ? false : { rejectUnauthorized: false },
  max: 3,
})

async function fetchSisePage(code, page) {
  try {
    const res = await fetch(
      `https://finance.naver.com/item/sise_day.naver?code=${code}&page=${page}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": `https://finance.naver.com/item/main.naver?code=${code}`,
          "Accept-Language": "ko-KR,ko;q=0.9",
        },
      }
    )
    if (!res.ok) return []
    const buf  = await res.arrayBuffer()
    const html = new TextDecoder("euc-kr").decode(buf)
    const result = []
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
      const emM = seg.match(/<em[^>]*>([\s\S]*?)<\/em>/i)
      if (emM) {
        const numM = emM[1].match(/([\d,]+)/)
        if (numM) {
          const num = Number(numM[1].replace(/,/g, ""))
          e_amt = /dn\.gif|하락/.test(emM[1]) ? -num : num
        }
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

async function syncStock(stockCode, stockType) {
  const todayStr = new Date().toISOString().slice(0, 10)
  await pool.query(`DELETE FROM t_stock_amt WHERE stock_code = $1 AND e_date = $2::date`, [stockCode, todayStr])

  const { rows } = await pool.query(
    `SELECT TO_CHAR(MAX(e_date), 'YYYY-MM-DD') AS max_date FROM t_stock_amt WHERE stock_code = $1`,
    [stockCode]
  )
  const maxDateStr = rows[0]?.max_date ?? null

  const maxPage = maxDateStr ? 6 : 30
  const allPrices = []
  let done = false

  for (let batchStart = 1; batchStart <= maxPage && !done; batchStart += 3) {
    const pages = [batchStart, batchStart+1, batchStart+2].filter(p => p <= maxPage)
    const batchPrices = (await Promise.all(pages.map(p => fetchSisePage(stockCode, p)))).flat()
    if (batchPrices.length === 0) break
    for (const p of batchPrices) {
      if (maxDateStr && p.date <= maxDateStr) { done = true; break }
      allPrices.push(p)
    }
  }

  if (allPrices.length === 0) return 0

  const seen = new Set()
  const unique = allPrices.filter(p => { if (seen.has(p.date)) return false; seen.add(p.date); return true })

  for (const p of unique) {
    await pool.query(
      `INSERT INTO t_stock_amt (e_date, stock_code, stock_type, e_amt, c_amt, e_rate, e_trade, finish_yn)
       VALUES ($2::date, $1, $3, $4, $5, $6, $7, 'Y')
       ON CONFLICT (e_date, stock_code) DO UPDATE
         SET e_amt = EXCLUDED.e_amt, c_amt = EXCLUDED.c_amt, e_rate = EXCLUDED.e_rate,
             e_trade = EXCLUDED.e_trade, stock_type = EXCLUDED.stock_type, updated_at = NOW()`,
      [stockCode, p.date, String(stockType), p.close, p.e_amt, p.e_rate, p.e_trade]
    )
  }
  return unique.length
}

async function main() {
  console.log(`[sync] 시작: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`)

  // 수집 대상: t_stock_list default_yn='Y'
  const { rows: stocks } = await pool.query(`
    SELECT stock_code,
           CASE WHEN security_type ILIKE '%ETF%' THEN 2 ELSE 1 END AS stock_type
    FROM t_stock_list
    WHERE default_yn = 'Y'
    ORDER BY listed_shares DESC NULLS LAST
  `)

  if (stocks.length === 0) {
    console.log("[sync] t_stock_list default_yn='Y' 데이터 없음")
    await pool.end()
    return
  }

  console.log(`[sync] 수집 대상 ${stocks.length}개`)
  for (const s of stocks) {
    try {
      const saved = await syncStock(s.stock_code, Number(s.stock_type))
      console.log(`  ✓ ${s.stock_code}: ${saved}건 저장`)
    } catch (e) {
      console.error(`  ✗ ${s.stock_code}: ${e.message}`)
    }
  }

  console.log(`[sync] 완료: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`)
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
