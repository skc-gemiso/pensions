"use server"

import { Pool } from "pg"

let pool: Pool | null = null

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.PENSION_SIM_DB_HOST,
      port: Number(process.env.PENSION_SIM_DB_PORT || 5432),
      database: process.env.PENSION_SIM_DB_NAME,
      user: process.env.PENSION_SIM_DB_USER,
      password: process.env.PENSION_SIM_DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
      max: 3,
    })
  }
  return pool
}

async function ensureTable(db: Pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pension_sim_savings_fund (
      id        SERIAL PRIMARY KEY,
      tab_id    VARCHAR(50)  NOT NULL,
      tab_label VARCHAR(50)  NOT NULL,
      saved_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      inputs    JSONB        NOT NULL,
      results   JSONB        NOT NULL
    )
  `)
  // title / memo 컬럼이 없는 기존 테이블에 추가
  await db.query(`ALTER TABLE pension_sim_savings_fund ADD COLUMN IF NOT EXISTS title VARCHAR(200)`)
  await db.query(`ALTER TABLE pension_sim_savings_fund ADD COLUMN IF NOT EXISTS memo  TEXT`)
}

export type SavedSim = {
  id: number
  savedAt: string
  title: string
  memo: string
  inputs: InputValues
  results: ComputedRow[]
}

export type InputValues = {
  initDeposit: number
  monthlyPmt: number
  accumMonths: number
  holdMonths: number
  ccAnnualRate: number
  retirementAge: number
  birthdate: string   // "YYYY-MM-DD" or ""
}

export type ComputedRow = {
  rate: string
  kodex:   [string, string, string, string]
  covered: [string, string, string, string]
  diff:    [string, string, string, string]
  dividend: [string, string]   // [1년 배당금(만), 1개월 배당금(만)]
}

export async function saveSimulation(
  tabId: string,
  tabLabel: string,
  title: string,
  memo: string,
  inputs: InputValues,
  results: ComputedRow[]
): Promise<{ id: number; savedAt: string }> {
  const db = getPool()
  await ensureTable(db)
  const res = await db.query(
    `INSERT INTO pension_sim_savings_fund (tab_id, tab_label, title, memo, inputs, results)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, saved_at`,
    [tabId, tabLabel, title || null, memo || null, JSON.stringify(inputs), JSON.stringify(results)]
  )
  return {
    id: res.rows[0].id,
    savedAt: (res.rows[0].saved_at as Date).toISOString(),
  }
}

export async function loadSimulations(tabId: string): Promise<SavedSim[]> {
  const db = getPool()
  await ensureTable(db)
  const res = await db.query(
    `SELECT id, saved_at, title, memo, inputs, results
     FROM pension_sim_savings_fund
     WHERE tab_id = $1
     ORDER BY saved_at DESC
     LIMIT 20`,
    [tabId]
  )
  return res.rows.map((r) => ({
    id: r.id,
    savedAt: (r.saved_at as Date).toISOString(),
    title:   r.title  ?? "",
    memo:    r.memo   ?? "",
    inputs:  r.inputs  as InputValues,
    results: r.results as ComputedRow[],
  }))
}

export async function deleteSimulation(id: number): Promise<void> {
  const db = getPool()
  await db.query(`DELETE FROM pension_sim_savings_fund WHERE id = $1`, [id])
}
