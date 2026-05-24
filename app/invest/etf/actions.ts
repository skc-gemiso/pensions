"use server"

import { auth } from "@/auth"
import { getPensionPool } from "@/lib/pension-db"
import { startCollection, getCollectStatus } from "@/lib/etf-collector"

const COUNTRY_MAP: Record<string, string> = { KR: "Korea (South)" }

function toDateStr(v: Date | string | null | undefined): string {
  if (v == null) return ""
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, "0")
    const d = String(v.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }
  return String(v).slice(0, 10)
}

function countryParam(country?: string | null): string | null {
  return country ? (COUNTRY_MAP[country] ?? null) : null
}

export async function getDefaultTickers(): Promise<{ ticker: string; name: string }[]> {
  const pool = getPensionPool()
  const { rows } = await pool.query<{ ticker: string; name: string }>(
    `SELECT stock_code AS ticker, stock_short_name AS name
     FROM t_stock_list
     WHERE default_yn = 'Y'
     ORDER BY listed_shares DESC NULLS LAST`
  )
  return rows
}

export async function getFetchLog() {
  const pool = getPensionPool()
  const { rows } = await pool.query<{
    etf_ticker: string
    holding_date: string
    fetched_at: string
    status: string
    row_count: number | null
    error_msg: string | null
  }>(
    `SELECT etf_ticker, holding_date, fetched_at, status, row_count, error_msg
     FROM etf_fetch_log
     ORDER BY holding_date DESC, etf_ticker ASC
     LIMIT 60`
  )
  return rows
}

export async function getTickers(etf: string, country?: string | null) {
  const pool = getPensionPool()
  const { rows } = await pool.query<{ ticker: string; name: string; location: string }>(
    `SELECT ticker, MAX(name) AS name, MAX(location) AS location
     FROM etf_holdings
     WHERE ($1 = 'ALL' OR etf_ticker = $1)
       AND ($2::text IS NULL OR location = $2)
     GROUP BY ticker
     ORDER BY MAX(name)`,
    [etf.toUpperCase(), countryParam(country)]
  )
  return rows
}

export async function getStockSeries(etf: string, ticker: string) {
  const pool = getPensionPool()
  const { rows } = await pool.query<{
    holding_date: Date | string
    price: number
    price_krw: number
    market_currency: string
    weight_pct: number
    shares: number
    market_value: number
  }>(
    `WITH base AS (
       SELECT holding_date,
              AVG(price)           AS price,
              MAX(market_currency) AS market_currency,
              SUM(shares)          AS shares,
              SUM(market_value)    AS stock_mv,
              AVG(fx_rate)         AS fx_rate,
              SUM(weight_pct)      AS stored_weight
       FROM etf_holdings
       WHERE ($1 = 'ALL' OR etf_ticker = $1) AND ticker = $2
       GROUP BY holding_date
     ),
     etf_total AS (
       SELECT holding_date,
              SUM(market_value)    AS total_mv
       FROM etf_holdings
       WHERE ($1 = 'ALL' OR etf_ticker = $1)
       GROUP BY holding_date
     )
     SELECT b.holding_date,
            b.price,
            b.market_currency,
            b.shares,
            b.stock_mv AS market_value,
            CASE WHEN $1 = 'ALL'
                 THEN CASE WHEN t.total_mv > 0
                           THEN ROUND((b.stock_mv / t.total_mv * 100)::numeric, 4)
                           ELSE 0 END
                 ELSE b.stored_weight
            END AS weight_pct,
            ROUND(b.stock_mv / NULLIF(b.shares, 0) * b.fx_rate) AS price_krw
     FROM base b
     JOIN etf_total t ON t.holding_date = b.holding_date
     ORDER BY b.holding_date ASC`,
    [etf.toUpperCase(), ticker]
  )
  return rows.map((r) => ({ ...r, holding_date: toDateStr(r.holding_date) }))
}

export async function getPriceRiseTop(etf: string, country?: string | null, days?: number | null) {
  const pool = getPensionPool()
  const { rows } = await pool.query<{
    ticker: string; name: string; location: string
    first_price: number; last_price: number
    price_change: number; pct_change: number
  }>(
    `WITH source AS (
       SELECT ticker, MAX(name) AS name, MAX(location) AS location,
              holding_date, AVG(price) AS price, AVG(fx_rate) AS fx_rate
       FROM etf_holdings
       WHERE ($1 = 'ALL' OR etf_ticker = $1) AND price IS NOT NULL
         AND ($3::int IS NULL OR holding_date >= CURRENT_DATE - ($3 || ' days')::interval)
       GROUP BY ticker, holding_date
     ),
     minmax AS (
       SELECT ticker, MIN(holding_date) AS fd, MAX(holding_date) AS ld FROM source GROUP BY ticker
     ),
     endpoints AS (
       SELECT m.ticker, f.name, f.location,
              f.price AS first_price, l.price AS last_price,
              f.fx_rate AS first_fx, l.fx_rate AS last_fx
       FROM minmax m
       JOIN source f ON f.ticker = m.ticker AND f.holding_date = m.fd
       JOIN source l ON l.ticker = m.ticker AND l.holding_date = m.ld
     )
     SELECT ticker, name, location,
            ROUND((first_price * first_fx)::numeric) AS first_price,
            ROUND((last_price  * last_fx )::numeric) AS last_price,
            ROUND((last_price  * last_fx  - first_price * first_fx)::numeric) AS price_change,
            CASE WHEN first_price > 0
                 THEN ROUND(((last_price - first_price)/first_price*100)::numeric, 1)
                 ELSE 0 END AS pct_change
     FROM endpoints
     WHERE first_price IS NOT NULL AND last_price IS NOT NULL AND first_price > 0
       AND ($2::text IS NULL OR location = $2)
     ORDER BY pct_change DESC
     LIMIT 20`,
    [etf.toUpperCase(), countryParam(country), days ?? null]
  )
  return rows
}

export async function getPriceRiseSeries(etf: string, ticker: string) {
  const pool = getPensionPool()
  const { rows } = await pool.query<{
    holding_date: Date | string; price: number; shares: number; weight_pct: number
  }>(
    `SELECT holding_date, AVG(price) AS price, SUM(shares) AS shares, SUM(weight_pct) AS weight_pct
     FROM etf_holdings
     WHERE ($1 = 'ALL' OR etf_ticker = $1) AND ticker = $2
     GROUP BY holding_date
     ORDER BY holding_date ASC`,
    [etf.toUpperCase(), ticker]
  )
  return rows.map((r) => ({ ...r, holding_date: toDateStr(r.holding_date) }))
}

export async function getVolumeChangeTop(etf: string, country?: string | null, days?: number | null) {
  const pool = getPensionPool()
  const { rows } = await pool.query<{
    ticker: string; name: string; location: string
    first_shares: number; last_shares: number
    shares_change: number; pct_change: number
  }>(
    `WITH source AS (
       SELECT ticker, MAX(name) AS name, MAX(location) AS location,
              holding_date, SUM(shares) AS shares
       FROM etf_holdings
       WHERE ($1 = 'ALL' OR etf_ticker = $1) AND shares IS NOT NULL
         AND ($3::int IS NULL OR holding_date >= CURRENT_DATE - ($3 || ' days')::interval)
       GROUP BY ticker, holding_date
     ),
     minmax AS (
       SELECT ticker, MIN(holding_date) AS fd, MAX(holding_date) AS ld FROM source GROUP BY ticker
     ),
     endpoints AS (
       SELECT m.ticker, f.name, f.location, f.shares AS first_shares, l.shares AS last_shares
       FROM minmax m
       JOIN source f ON f.ticker = m.ticker AND f.holding_date = m.fd
       JOIN source l ON l.ticker = m.ticker AND l.holding_date = m.ld
     )
     SELECT ticker, name, location,
            ROUND(first_shares::numeric) AS first_shares,
            ROUND(last_shares ::numeric) AS last_shares,
            ROUND((last_shares - first_shares)::numeric) AS shares_change,
            CASE WHEN first_shares > 0
                 THEN ROUND(((last_shares - first_shares)/first_shares*100)::numeric, 1)
                 ELSE 0 END AS pct_change
     FROM endpoints
     WHERE first_shares IS NOT NULL AND last_shares IS NOT NULL
       AND ($2::text IS NULL OR location = $2)
     ORDER BY ABS(last_shares - first_shares) DESC
     LIMIT 20`,
    [etf.toUpperCase(), countryParam(country), days ?? null]
  )
  return rows
}

export async function getVolumeChangeSeries(etf: string, ticker: string) {
  const pool = getPensionPool()
  const { rows } = await pool.query<{
    holding_date: Date | string; shares: number; price: number; weight_pct: number
  }>(
    `SELECT holding_date, SUM(shares) AS shares, AVG(price) AS price, SUM(weight_pct) AS weight_pct
     FROM etf_holdings
     WHERE ($1 = 'ALL' OR etf_ticker = $1) AND ticker = $2
     GROUP BY holding_date
     ORDER BY holding_date ASC`,
    [etf.toUpperCase(), ticker]
  )
  return rows.map((r) => ({ ...r, holding_date: toDateStr(r.holding_date) }))
}

export async function getRecommend(etf: string, country?: string | null, days?: number | null) {
  const pool = getPensionPool()
  const { rows } = await pool.query<{
    ticker: string; name: string; sector: string; location: string
    last_price: number; last_weight: number; last_shares: number
    weight_change: number; shares_change: number; price_change_pct: number
    recent_weight_change: number; recent_shares_change: number; recent_price_change_pct: number
    full_days: number
  }>(
    `WITH source AS (
       SELECT etf_ticker, ticker, MAX(name) AS name, MAX(sector) AS sector, MAX(location) AS location,
              holding_date, MAX(price) AS price, SUM(weight_pct) AS weight_pct, SUM(shares) AS shares
       FROM etf_holdings
       WHERE ($1 = 'ALL' OR etf_ticker = $1)
         AND ($3::int IS NULL OR holding_date >= CURRENT_DATE - ($3 || ' days')::interval)
       GROUP BY etf_ticker, ticker, holding_date
     ),
     minmax AS (
       SELECT ticker, MIN(holding_date) AS fd, MAX(holding_date) AS ld FROM source GROUP BY ticker
     ),
     recent_anchor AS (
       -- 종료일 기준 14 캘린더일 이전의 가장 가까운 영업일
       SELECT s.ticker, MAX(s.holding_date) AS rd
       FROM source s
       JOIN minmax m ON m.ticker = s.ticker
       WHERE s.holding_date <= m.ld - 14
       GROUP BY s.ticker
     ),
     endpoints AS (
       SELECT m.ticker, MAX(sf.name) AS name, MAX(sf.sector) AS sector, MAX(sf.location) AS location,
              AVG(sf.price) AS fp, AVG(sl.price) AS lp,
              AVG(sf.weight_pct) AS fw, AVG(sl.weight_pct) AS lw,
              SUM(sf.shares) AS fs, SUM(sl.shares) AS ls,
              AVG(sr.price) AS rp, AVG(sr.weight_pct) AS rw, SUM(sr.shares) AS r_shares,
              (m.ld - m.fd) AS full_days
       FROM minmax m
       JOIN source sf ON sf.ticker = m.ticker AND sf.holding_date = m.fd
       JOIN source sl ON sl.ticker = m.ticker AND sl.holding_date = m.ld
       LEFT JOIN recent_anchor ra ON ra.ticker = m.ticker
       LEFT JOIN source sr ON sr.ticker = m.ticker AND sr.holding_date = ra.rd
       GROUP BY m.ticker, m.ld, m.fd
     )
     SELECT ticker, name, sector, location,
            ROUND(lp::numeric, 4) AS last_price,
            ROUND(lw::numeric, 4) AS last_weight,
            ROUND(ls::numeric, 2) AS last_shares,
            ROUND((lw - fw)::numeric, 4) AS weight_change,
            ROUND((ls - fs)::numeric, 2) AS shares_change,
            CASE WHEN fp > 0 THEN ROUND(((lp-fp)/fp*100)::numeric,2) ELSE 0 END AS price_change_pct,
            -- 최근 14일 변화 (감쇠 모델용); recent_anchor 없으면 전체 기간 변화로 대체
            ROUND((lw - COALESCE(rw, fw))::numeric, 4) AS recent_weight_change,
            ROUND((ls - COALESCE(r_shares, fs))::numeric, 2) AS recent_shares_change,
            CASE WHEN COALESCE(rp, fp) > 0
                 THEN ROUND(((lp - COALESCE(rp, fp)) / COALESCE(rp, fp) * 100)::numeric, 2)
                 ELSE 0 END AS recent_price_change_pct,
            full_days
     FROM endpoints
     WHERE fp IS NOT NULL AND lp IS NOT NULL AND fp > 0
       AND fw IS NOT NULL AND lw IS NOT NULL AND fs IS NOT NULL AND ls IS NOT NULL
       AND ($2::text IS NULL OR location = $2)
     ORDER BY
       (CASE WHEN lw > COALESCE(rw, fw) THEN 20 ELSE 0 END)
       + (CASE WHEN ls > COALESCE(r_shares, fs) THEN 20 ELSE 0 END)
       + (CASE WHEN lw > fw THEN 10 ELSE 0 END)
       + (CASE WHEN ls > fs THEN 10 ELSE 0 END)
       + (CASE WHEN ABS(lp - COALESCE(rp, fp)) > 0 THEN 10 ELSE 0 END)
       + (CASE WHEN ABS(lp - fp) > 0 THEN 10 ELSE 0 END)
       DESC, ABS(lw - COALESCE(rw, fw)) DESC
     LIMIT 20`,
    [etf.toUpperCase(), countryParam(country), days ?? null]
  )
  return rows
}

export async function getStockEtfWeights(tickers: string[]) {
  if (tickers.length === 0) return []
  const pool = getPensionPool()
  const { rows } = await pool.query<{ ticker: string; etf_ticker: string; weight_pct: number }>(
    `WITH latest_per_etf AS (
       SELECT etf_ticker, MAX(holding_date) AS ld
       FROM etf_holdings
       GROUP BY etf_ticker
     )
     SELECT h.ticker, h.etf_ticker,
            ROUND(SUM(h.weight_pct)::numeric, 2) AS weight_pct
     FROM etf_holdings h
     JOIN latest_per_etf l ON l.etf_ticker = h.etf_ticker AND h.holding_date = l.ld
     WHERE h.ticker = ANY($1::text[])
     GROUP BY h.ticker, h.etf_ticker
     ORDER BY h.ticker, h.etf_ticker`,
    [tickers]
  )
  return rows
}

export async function getEtfSummary(days?: number | null) {
  const pool = getPensionPool()
  const { rows } = await pool.query<{
    etf_ticker: string
    last_date: Date | string; first_date: Date | string
    last_mv_krw: number; first_mv_krw: number
    mv_change_krw: number; mv_change_pct: number
    stock_count: number
  }>(
    `WITH period_bounds AS (
       SELECT etf_ticker,
              MIN(holding_date) AS fd,
              MAX(holding_date) AS ld
       FROM etf_holdings
       WHERE $1::int IS NULL OR holding_date >= CURRENT_DATE - ($1 || ' days')::interval
       GROUP BY etf_ticker
     ),
     current_stats AS (
       SELECT h.etf_ticker,
              ROUND(SUM(h.market_value * h.fx_rate)::numeric) AS total_mv_krw,
              COUNT(DISTINCT h.ticker) AS stock_count
       FROM etf_holdings h
       JOIN period_bounds pb ON pb.etf_ticker = h.etf_ticker AND h.holding_date = pb.ld
       GROUP BY h.etf_ticker
     ),
     prev_stats AS (
       SELECT h.etf_ticker,
              ROUND(SUM(h.market_value * h.fx_rate)::numeric) AS total_mv_krw
       FROM etf_holdings h
       JOIN period_bounds pb ON pb.etf_ticker = h.etf_ticker AND h.holding_date = pb.fd
       GROUP BY h.etf_ticker
     )
     SELECT cs.etf_ticker,
            pb.ld AS last_date, pb.fd AS first_date,
            cs.total_mv_krw AS last_mv_krw, ps.total_mv_krw AS first_mv_krw,
            (cs.total_mv_krw - ps.total_mv_krw) AS mv_change_krw,
            CASE WHEN ps.total_mv_krw > 0
                 THEN ROUND(((cs.total_mv_krw - ps.total_mv_krw)/ps.total_mv_krw*100)::numeric, 1)
                 ELSE 0 END AS mv_change_pct,
            cs.stock_count
     FROM current_stats cs
     JOIN prev_stats ps ON ps.etf_ticker = cs.etf_ticker
     JOIN period_bounds pb ON pb.etf_ticker = cs.etf_ticker
     ORDER BY cs.etf_ticker`,
    [days ?? null]
  )
  return rows.map((r) => ({
    ...r,
    last_date: toDateStr(r.last_date),
    first_date: toDateStr(r.first_date),
  }))
}

export async function triggerCollect() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (role !== "admin") return { error: "권한이 없습니다." }
  return startCollection()
}

export async function getCollectStatusAction() {
  return getCollectStatus()
}
