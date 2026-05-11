"use server"

import { auth } from "../../../auth"
import { getPensionPool } from "../../../lib/pension-db"
import { headers } from "next/headers"

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
  await db.query(`ALTER TABLE pension_sim_savings_fund ADD COLUMN IF NOT EXISTS title      VARCHAR(200)`)
  await db.query(`ALTER TABLE pension_sim_savings_fund ADD COLUMN IF NOT EXISTS memo       TEXT`)
  await db.query(`ALTER TABLE pension_sim_savings_fund ADD COLUMN IF NOT EXISTS saved_by   VARCHAR(50)`)
  await db.query(`ALTER TABLE pension_sim_savings_fund ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45)`)
}

async function getClientIp(): Promise<string> {
  const h = await headers()
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  )
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
  safeRate?: number      // IRP only: safe-asset annual return rate (0.05 = 5%)
  taxFreeLimit?: number  // 예약 필드 (미사용)
}

export type ComputedRow = {
  rate: string
  kodex:   [string, string, string, string]
  covered: [string, string, string, string]
  diff:    [string, string, string, string]
  dividend: [string, string]   // [1년 배당금(만), 1개월 배당금(만)]
}

const SAVE_LIMIT: Record<string, number> = {
  normal: 10,
  khj:    20,
}

// IP당 허용 저장 수 (역할별 한도의 2배 — 같은 네트워크 다중 계정 고려)
const IP_LIMIT: Record<string, number> = {
  normal: 20,
  khj:    40,
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
  const role    = (session.user as { role?: string })?.role ?? "normal"
  const savedBy = (session.user as { name?: string })?.name ?? "unknown"
  const ip      = await getClientIp()

  const db = getPensionPool()
  await ensureTable(db)

  // IP 기반 저장 차단 (admin 제외)
  if (role !== "admin" && ip !== "unknown") {
    const ipLimit = IP_LIMIT[role] ?? 20
    const { rows: ipRows } = await db.query<{ c: string }>(
      `SELECT COUNT(*) AS c FROM pension_sim_savings_fund WHERE ip_address = $1`,
      [ip]
    )
    if (parseInt(ipRows[0].c) >= ipLimit) {
      throw new Error(`IP_LIMIT_EXCEEDED:같은 네트워크에서 저장 가능한 최대 수량(${ipLimit}개)을 초과했습니다. 기존 시뮬레이션을 삭제 후 다시 시도하세요.`)
    }
  }

  // 사용자별 한도 초과 시 오래된 것부터 자동 삭제 (admin 제외)
  const limit = role === "admin" ? null : (SAVE_LIMIT[role] ?? 10)
  if (limit !== null) {
    const { rows } = await db.query<{ c: string }>(
      `SELECT COUNT(*) AS c FROM pension_sim_savings_fund WHERE saved_by = $1`,
      [savedBy]
    )
    const over = parseInt(rows[0].c) - limit + 1
    if (over > 0) {
      await db.query(
        `DELETE FROM pension_sim_savings_fund
         WHERE id IN (
           SELECT id FROM pension_sim_savings_fund
           WHERE saved_by = $1
           ORDER BY saved_at ASC
           LIMIT $2
         )`,
        [savedBy, over]
      )
    }
  }

  const res = await db.query(
    `INSERT INTO pension_sim_savings_fund (tab_id, tab_label, title, memo, inputs, results, saved_by, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, saved_at`,
    [tabId, tabLabel, title || null, memo || null, JSON.stringify(inputs), JSON.stringify(results), savedBy, ip]
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
  const fetchLimit = role === "admin" ? 50 : (SAVE_LIMIT[role ?? ""] ?? 10)

  const res = role === "admin"
    ? await db.query(
        `SELECT id, saved_at, title, memo, saved_by, inputs, results
         FROM pension_sim_savings_fund
         WHERE tab_id = $1
         ORDER BY saved_at DESC
         LIMIT $2`,
        [tabId, fetchLimit]
      )
    : await db.query(
        `SELECT id, saved_at, title, memo, saved_by, inputs, results
         FROM pension_sim_savings_fund
         WHERE tab_id = $1 AND saved_by = $2
         ORDER BY saved_at DESC
         LIMIT $3`,
        [tabId, userName ?? "", fetchLimit]
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

  const role     = (session.user as { role?: string })?.role ?? null
  const userName = (session.user as { name?: string })?.name ?? null

  const db = getPensionPool()
  if (role === "admin") {
    await db.query(`DELETE FROM pension_sim_savings_fund WHERE id = $1`, [id])
  } else {
    await db.query(
      `DELETE FROM pension_sim_savings_fund WHERE id = $1 AND saved_by = $2`,
      [id, userName ?? ""]
    )
  }
}
