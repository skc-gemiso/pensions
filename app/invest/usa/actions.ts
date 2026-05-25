"use server"

import { getPensionPool } from "@/lib/pension-db"
import { auth } from "@/auth"
import { startCollection, getCollectStatus, startFxCollection, getFxCollectStatus } from "@/lib/usa-collector"

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

export async function triggerUsaCollect() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (role !== "admin") return { error: "권한이 없습니다" }
  return startCollection()
}

export async function getUsaCollectStatusAction() {
  return getCollectStatus()
}

export async function triggerFxCollect() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (role !== "admin") return { error: "권한이 없습니다" }
  return startFxCollection()
}

export async function getFxCollectStatusAction() {
  return getFxCollectStatus()
}


export type IndicatorMeta = {
  indicator_code: string
  indicator_name: string
  unit: string
  description: string | null
}

export type IndicatorCard = IndicatorMeta & {
  latest_date: string | null
  latest_value: number | null
  prev_value: number | null
  spark: { date: string; value: number }[]
}

export async function getIndicatorLatest(): Promise<IndicatorCard[]> {
  const pool = getPensionPool()

  const { rows: masters } = await pool.query<IndicatorMeta>(
    `SELECT indicator_code, indicator_name, unit, description
     FROM indicator_master
     ORDER BY indicator_code`
  )

  const { rows: data } = await pool.query<{ indicator_code: string; stat_date: string; value: number }>(
    `SELECT indicator_code, stat_date, value
     FROM (
       SELECT indicator_code, stat_date, value,
              ROW_NUMBER() OVER (PARTITION BY indicator_code ORDER BY stat_date DESC) AS rn
       FROM indicator_data
     ) t
     WHERE rn <= 13
     ORDER BY indicator_code, stat_date ASC`
  )

  return masters.map((m) => {
    const points = data.filter((d) => d.indicator_code === m.indicator_code)
    const latest = points[points.length - 1]
    const prev   = points[points.length - 2]
    return {
      ...m,
      latest_date:   latest ? toDateStr(latest.stat_date) : null,
      latest_value:  latest ? Number(latest.value) : null,
      prev_value:    prev   ? Number(prev.value)   : null,
      spark: points.map((p) => ({ date: toDateStr(p.stat_date), value: Number(p.value) })),
    }
  })
}

export async function getIndicatorList(): Promise<IndicatorMeta[]> {
  const pool = getPensionPool()
  const { rows } = await pool.query<IndicatorMeta>(
    `SELECT indicator_code, indicator_name, unit, description
     FROM indicator_master
     ORDER BY indicator_code`
  )
  return rows
}

export async function getIndicatorSeries(code: string, months?: number) {
  const pool = getPensionPool()
  const { rows } = await pool.query<{ stat_date: string; value: number }>(
    `SELECT stat_date, value
     FROM indicator_data
     WHERE indicator_code = $1
       AND ($2::int IS NULL OR stat_date >= NOW() - ($2 || ' months')::interval)
     ORDER BY stat_date ASC`,
    [code, months ?? null]
  )
  return rows.map((r) => ({ stat_date: toDateStr(r.stat_date), value: Number(r.value) }))
}

export async function getTreasurySeries(months?: number) {
  const pool = getPensionPool()
  const { rows } = await pool.query<{
    stat_date: string
    country_code: string
    country_name: string
    amount_usd_billion: number
    fx_rate: number | null
    amount_krw_trillion: number | null
  }>(
    `SELECT th.stat_date, th.country_code, th.country_name, th.amount_usd_billion,
            fx.rate AS fx_rate,
            CASE WHEN fx.rate IS NOT NULL
                 THEN ROUND((th.amount_usd_billion * fx.rate / 1000)::numeric, 2)
                 ELSE NULL END AS amount_krw_trillion
     FROM treasury_holding th
     LEFT JOIN LATERAL (
       SELECT fx_rate::numeric AS rate
       FROM t_fx_rate
       WHERE e_date <= TO_CHAR(th.stat_date, 'YYYYMMDD')
       ORDER BY e_date DESC LIMIT 1
     ) fx ON true
     WHERE ($1::int IS NULL OR th.stat_date >= NOW() - ($1 || ' months')::interval)
     ORDER BY th.stat_date ASC, th.country_code ASC`,
    [months ?? null]
  )
  return rows.map((r) => ({
    stat_date:           toDateStr(r.stat_date),
    country_code:        r.country_code,
    country_name:        r.country_name,
    amount_usd_billion:  Number(r.amount_usd_billion),
    fx_rate:             r.fx_rate != null ? Number(r.fx_rate) : null,
    amount_krw_trillion: r.amount_krw_trillion != null ? Number(r.amount_krw_trillion) : null,
  }))
}

export async function getFxSeries(months?: number) {
  const pool = getPensionPool()
  const { rows } = await pool.query<{ stat_date: string; exchange_rate: number }>(
    `SELECT e_date AS stat_date, fx_rate AS exchange_rate
     FROM t_fx_rate
     WHERE ($1::int IS NULL OR TO_DATE(e_date, 'YYYYMMDD') >= NOW() - ($1 || ' months')::interval)
     ORDER BY e_date ASC`,
    [months ?? null]
  )
  return rows.map((r) => ({
    stat_date: `${r.stat_date.slice(0, 4)}-${r.stat_date.slice(4, 6)}-${r.stat_date.slice(6, 8)}`,
    exchange_rate: Number(r.exchange_rate),
  }))
}

export async function getCollectLogRecent() {
  const pool = getPensionPool()
  const { rows } = await pool.query<{
    log_id: number
    collector_name: string
    target_name: string | null
    stat_date: string | null
    started_at: string | null
    finished_at: string | null
    status: string
    row_count: number | null
    message: string | null
  }>(
    `SELECT log_id, collector_name, target_name, stat_date, started_at, finished_at, status, row_count, message
     FROM usa_collect_log
     ORDER BY started_at DESC NULLS LAST
     LIMIT 60`
  )
  return rows
}

export async function getCollectLastRun() {
  const pool = getPensionPool()
  const { rows } = await pool.query<{
    collector_name: string
    last_run: string | null
    last_status: string | null
  }>(
    `SELECT collector_name,
            MAX(finished_at) AS last_run,
            (ARRAY_AGG(status ORDER BY finished_at DESC NULLS LAST))[1] AS last_status
     FROM usa_collect_log
     GROUP BY collector_name
     ORDER BY collector_name`
  )
  return rows
}
