"use server"

import { auth } from "@/auth"
import { getPensionPool } from "@/lib/pension-db"

// ── 기존: 납부 이력 타입 (호환 유지) ──────────────────────────
export type PaymentRecord = {
  id: string
  yearMonth: string
  workplace: string
  monthlyIncome: number
  premium: number
}

export type NpData = {
  expectedMonthly: number | null
  history: PaymentRecord[]
}

// ── 신규: 예상 수령액 확인 이력 ──────────────────────────────
export type Snapshot = {
  id: number
  date: string
  totalPremium: number
  monthlyNet: number
  monthlyGross: number | null
}

const SEED_SNAPSHOTS = [
  { date: "2026.05.05", totalPremium: 144_142_920, monthlyNet: 1_311_130, monthlyGross: 1_347_020 },
  { date: "2025.02.15", totalPremium: 126_911_400, monthlyNet: 1_246_810, monthlyGross: null },
  { date: "2023.05.25", totalPremium: 116_053_080, monthlyNet: 1_106_830, monthlyGross: null },
]

async function ensureSnapshotTable() {
  const pool = getPensionPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS np_snapshots (
      id            SERIAL PRIMARY KEY,
      check_date    VARCHAR(20)  NOT NULL,
      total_premium BIGINT       NOT NULL,
      monthly_net   INT          NOT NULL,
      monthly_gross INT,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `)
  // 최초 실행 시 기존 데이터 시딩
  const { rows } = await pool.query<{ c: string }>("SELECT COUNT(*) AS c FROM np_snapshots")
  if (parseInt(rows[0].c) === 0) {
    for (const s of SEED_SNAPSHOTS) {
      await pool.query(
        "INSERT INTO np_snapshots (check_date, total_premium, monthly_net, monthly_gross) VALUES ($1, $2, $3, $4)",
        [s.date, s.totalPremium, s.monthlyNet, s.monthlyGross ?? null]
      )
    }
  }
}

function rowToSnapshot(r: { id: number; check_date: string; total_premium: string | number; monthly_net: number; monthly_gross: number | null }): Snapshot {
  return {
    id: r.id,
    date: r.check_date,
    totalPremium: Number(r.total_premium),
    monthlyNet: r.monthly_net,
    monthlyGross: r.monthly_gross,
  }
}

export async function loadSnapshots(): Promise<Snapshot[]> {
  const session = await auth()
  if (!session?.user) throw new Error("로그인이 필요합니다.")

  await ensureSnapshotTable()
  const pool = getPensionPool()
  const { rows } = await pool.query(
    "SELECT id, check_date, total_premium, monthly_net, monthly_gross FROM np_snapshots ORDER BY check_date DESC"
  )
  return rows.map(rowToSnapshot)
}

export async function addSnapshot(
  date: string,
  totalPremium: number,
  monthlyNet: number,
  monthlyGross: number | null,
): Promise<Snapshot> {
  const session = await auth()
  if (!session?.user) throw new Error("로그인이 필요합니다.")

  await ensureSnapshotTable()
  const pool = getPensionPool()
  const { rows } = await pool.query(
    `INSERT INTO np_snapshots (check_date, total_premium, monthly_net, monthly_gross)
     VALUES ($1, $2, $3, $4)
     RETURNING id, check_date, total_premium, monthly_net, monthly_gross`,
    [date, totalPremium, monthlyNet, monthlyGross ?? null]
  )
  return rowToSnapshot(rows[0])
}

export async function deleteSnapshot(id: number): Promise<void> {
  const session = await auth()
  if (!session?.user) throw new Error("로그인이 필요합니다.")

  const pool = getPensionPool()
  await pool.query("DELETE FROM np_snapshots WHERE id = $1", [id])
}
