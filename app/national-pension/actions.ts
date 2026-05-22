"use server"

import { auth } from "@/auth"
import { getPensionPool } from "@/lib/pension-db"

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

async function ensureNpTable() {
  const pool = getPensionPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS np_user_data (
      user_id          VARCHAR(50)  PRIMARY KEY,
      expected_monthly BIGINT,
      history          JSONB NOT NULL DEFAULT '[]',
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function getUserId(): Promise<string> {
  const session = await auth()
  const user = session?.user as { id?: string; name?: string } | undefined
  return user?.id ?? user?.name ?? ""
}

export async function loadNpData(): Promise<NpData> {
  const userId = await getUserId()
  if (!userId) return { expectedMonthly: null, history: [] }

  await ensureNpTable()
  const pool = getPensionPool()
  const { rows } = await pool.query<{ expected_monthly: number | null; history: PaymentRecord[] }>(
    "SELECT expected_monthly, history FROM np_user_data WHERE user_id = $1",
    [userId]
  )
  if (!rows[0]) return { expectedMonthly: null, history: [] }
  return {
    expectedMonthly: rows[0].expected_monthly,
    history: rows[0].history,
  }
}

export async function saveNpData(
  expectedMonthly: number | null,
  history: PaymentRecord[]
): Promise<void> {
  const userId = await getUserId()
  if (!userId) throw new Error("로그인이 필요합니다.")

  await ensureNpTable()
  const pool = getPensionPool()
  await pool.query(`
    INSERT INTO np_user_data (user_id, expected_monthly, history, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      expected_monthly = EXCLUDED.expected_monthly,
      history          = EXCLUDED.history,
      updated_at       = NOW()
  `, [userId, expectedMonthly, JSON.stringify(history)])
}
