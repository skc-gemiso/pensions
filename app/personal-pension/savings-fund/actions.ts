"use server"

import { auth } from "../../../auth"
import { getPensionPool } from "../../../lib/pension-db"

async function ensureTable(db: ReturnType<typeof getPensionPool>) {
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
  await db.query(`ALTER TABLE pension_sim_savings_fund ADD COLUMN IF NOT EXISTS title    VARCHAR(200)`)
  await db.query(`ALTER TABLE pension_sim_savings_fund ADD COLUMN IF NOT EXISTS memo     TEXT`)
  await db.query(`ALTER TABLE pension_sim_savings_fund ADD COLUMN IF NOT EXISTS saved_by VARCHAR(50)`)
}

export type SavedSim = {
  id: number
  savedAt: string
  title: string
  memo: string
  savedBy: string
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
  safeRate?: number      // ISA only: safe-asset annual return rate (0.05 = 5%)
  taxFreeLimit?: number  // ISA only: non-taxable gain limit in 만원 (200 or 400)
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
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  const savedBy = (session.user as { name?: string })?.name ?? "unknown"

  const db = getPensionPool()
  await ensureTable(db)
  const res = await db.query(
    `INSERT INTO pension_sim_savings_fund (tab_id, tab_label, title, memo, inputs, results, saved_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, saved_at`,
    [tabId, tabLabel, title || null, memo || null, JSON.stringify(inputs), JSON.stringify(results), savedBy]
  )
  return {
    id: res.rows[0].id,
    savedAt: (res.rows[0].saved_at as Date).toISOString(),
  }
}

export async function loadSimulations(tabId: string): Promise<SavedSim[]> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  const role = (session.user as { role?: string })?.role ?? null

  const db = getPensionPool()
  await ensureTable(db)

  const userName = (session.user as { name?: string })?.name ?? null

  const res = role === "admin"
    ? await db.query(
        `SELECT id, saved_at, title, memo, saved_by, inputs, results
         FROM pension_sim_savings_fund
         WHERE tab_id = $1
         ORDER BY saved_at DESC
         LIMIT 20`,
        [tabId]
      )
    : await db.query(
        `SELECT id, saved_at, title, memo, saved_by, inputs, results
         FROM pension_sim_savings_fund
         WHERE tab_id = $1 AND saved_by = $2
         ORDER BY saved_at DESC
         LIMIT 20`,
        [tabId, userName ?? ""]
      )

  return res.rows.map((r) => ({
    id: r.id,
    savedAt:  (r.saved_at as Date).toISOString(),
    title:    r.title    ?? "",
    memo:     r.memo     ?? "",
    savedBy:  r.saved_by ?? "",
    inputs:   r.inputs   as InputValues,
    results:  r.results  as ComputedRow[],
  }))
}

export async function deleteSimulation(id: number): Promise<void> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const role    = (session.user as { role?: string })?.role ?? null
  const userName = (session.user as { name?: string })?.name ?? null

  const db = getPensionPool()
  // admin은 전체 삭제 가능, 일반 사용자는 본인 데이터만 삭제
  if (role === "admin") {
    await db.query(`DELETE FROM pension_sim_savings_fund WHERE id = $1`, [id])
  } else {
    await db.query(
      `DELETE FROM pension_sim_savings_fund WHERE id = $1 AND saved_by = $2`,
      [id, userName ?? ""]
    )
  }
}
