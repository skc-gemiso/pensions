/**
 * 보유 종목 주가 자동 수집 스크립트
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

async function syncStock(stockCode, stockType) {
  const todayStr = new Date().toISOString().slice(0, 10)

  // 오늘 데이터 삭제 (재수집)
  await pool.query(
    `DELETE FROM f_stock_amt WHERE stock_code = $1 AND s_date = $2::date`,
    [stockCode, todayStr]
  )

  // 최종 저장 일자
  const { rows } = await pool.query(
    `SELECT TO_CHAR(MAX(s_date), 'YYYY-MM-DD') AS max_date FROM f_stock_amt WHERE stock_code = $1`,
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
      `INSERT INTO f_stock_amt (stock_code, s_date, stock_type, amt, finish_yn)
       VALUES ($1, $2::date, $3, $4, 'Y')
       ON CONFLICT (stock_code, s_date) DO UPDATE
         SET amt = EXCLUDED.amt, stock_type = EXCLUDED.stock_type, updated_at = NOW()`,
      [stockCode, p.date, String(stockType), p.close]
    )
  }
  return unique.length
}

async function main() {
  console.log(`[sync-stock-prices] 시작: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`)

  // 보유 종목 조회 (잔고 > 0인 종목)
  const { rows: holdings } = await pool.query(`
    SELECT stock_code, MAX(stock_type) AS stock_type
    FROM my_stock
    GROUP BY stock_code
    HAVING SUM(CASE WHEN cnt = 1 THEN qty ELSE -qty END) > 0
  `)

  if (holdings.length === 0) {
    console.log("[sync-stock-prices] 보유 종목 없음")
    await pool.end()
    return
  }

  console.log(`[sync-stock-prices] 보유 종목 ${holdings.length}개 수집 시작`)
  for (const h of holdings) {
    try {
      const saved = await syncStock(h.stock_code, Number(h.stock_type))
      console.log(`  ✓ ${h.stock_code}: ${saved}건 저장`)
    } catch (e) {
      console.error(`  ✗ ${h.stock_code}: ${e.message}`)
    }
  }

  console.log(`[sync-stock-prices] 완료: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`)
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
