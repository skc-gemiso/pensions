"use server"

import { getPensionPool } from "@/lib/pension-db"
import { requireAdmin } from "@/lib/guard"
import { calcRetireDate, type Profile, type RetireRule } from "@/lib/profile"

export type ProfileView = Profile & {
  /** 규정에 따라 계산한 정년 날짜 */
  retire_date: string
}

const DEFAULT: Profile = {
  birth_date: "1974-06-04",
  join_date: "2015-02-23",
  retire_age: 60,
  retire_rule: "month_end",
}

export async function getProfile(): Promise<ProfileView> {
  await requireAdmin()

  const pool = getPensionPool()
  const { rows } = await pool.query<Profile>(`
    SELECT birth_date::text AS birth_date, join_date::text AS join_date,
           retire_age, retire_rule
    FROM my_profile WHERE id = 1
  `)

  const p = rows[0] ?? DEFAULT
  if (rows.length === 0) {
    await pool.query(`
      INSERT INTO my_profile (id, birth_date, join_date, retire_age, retire_rule)
      VALUES (1, $1::date, $2::date, $3, $4) ON CONFLICT (id) DO NOTHING
    `, [DEFAULT.birth_date, DEFAULT.join_date, DEFAULT.retire_age, DEFAULT.retire_rule])
  }

  return { ...p, retire_date: calcRetireDate(p) }
}

export async function updateProfile(data: {
  birth_date: string
  join_date: string
  retire_age: number
  retire_rule: RetireRule
}): Promise<void> {
  await requireAdmin()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.birth_date)) throw new Error("생년월일 형식이 올바르지 않습니다.")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.join_date)) throw new Error("입사일 형식이 올바르지 않습니다.")
  if (data.join_date <= data.birth_date) throw new Error("입사일이 생년월일보다 빠릅니다.")

  const pool = getPensionPool()
  await pool.query(`
    UPDATE my_profile
    SET birth_date = $1::date, join_date = $2::date,
        retire_age = $3, retire_rule = $4, updated_at = NOW()
    WHERE id = 1
  `, [data.birth_date, data.join_date, data.retire_age, data.retire_rule])
}
