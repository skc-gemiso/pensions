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

// 1페이지 = 60영업일. 100 을 넘기면 네이버가 빈 응답을 준다
const NAVER_PAGE_SIZE = 60

const num = (v) => Number(String(v ?? "").replace(/,/g, "")) || 0

// 구 sise_day.naver 는 2026-09 부터 HTTP 410 Gone → 모바일 JSON API 로 교체
// 전일대비는 값에 부호가 들어 있고(-11,000), 등락률은 기존 데이터와 기준을 맞추려 직접 계산한다
async function fetchSisePage(code, page) {
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
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    const result = []
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

async function syncStock(stockCode, resyncDays = 0) {
  const todayStr = new Date().toISOString().slice(0, 10)

  if (resyncDays > 0) {
    await pool.query(
      `DELETE FROM t_stock_amt WHERE stock_code = $1 AND e_date >= (CURRENT_DATE - $2::int)`,
      [stockCode, resyncDays]
    )
  } else {
    await pool.query(`DELETE FROM t_stock_amt WHERE stock_code = $1 AND e_date = $2::date`, [stockCode, todayStr])
  }

  const { rows } = await pool.query(
    `SELECT TO_CHAR(MAX(e_date), 'YYYY-MM-DD') AS max_date FROM t_stock_amt WHERE stock_code = $1`,
    [stockCode]
  )
  const maxDateStr = rows[0]?.max_date ?? null

  // 1페이지 60영업일 — 증분이면 2페이지(120일), 최초 수집이면 5페이지(300일)
  // --resync-days 가 길면 그 구간을 덮도록 페이지를 늘린다 (루프는 기존 최신일에서 알아서 멈춘다)
  const maxPage = maxDateStr ? Math.max(2, Math.ceil(resyncDays / 60)) : 5
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

async function main() {
  const resyncDays = (() => {
    const idx = process.argv.indexOf("--resync-days")
    return idx !== -1 ? Number(process.argv[idx + 1]) : 0
  })()

  console.log(`[sync] 시작: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`)
  if (resyncDays > 0) console.log(`[sync] 최근 ${resyncDays}일 데이터 강제 재수집`)

  // 수집 대상: t_stock_list default_yn='Y'
  const { rows: stocks } = await pool.query(`
    SELECT stock_code
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
      const saved = await syncStock(s.stock_code, resyncDays)
      console.log(`  ✓ ${s.stock_code}: ${saved}건 저장`)
    } catch (e) {
      console.error(`  ✗ ${s.stock_code}: ${e.message}`)
    }
  }

  console.log(`[sync] 완료: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`)
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
