"use server"

import { requireAdmin } from "@/lib/guard"
import { profileFromEnv } from "@/lib/settings"
import { calcRetireDate, type Profile } from "@/lib/profile"

export type ProfileView = Profile & {
  /** 규정에 따라 계산한 정년 날짜 */
  retire_date: string
}

/**
 * 개인 정보 조회 — 출처는 `config/.env` 다 (DB 테이블 없음).
 * 수정은 환경 변수를 직접 바꾼 뒤 서버를 재시작한다.
 */
export async function getProfile(): Promise<ProfileView> {
  await requireAdmin()

  const p = profileFromEnv()
  return { ...p, retire_date: calcRetireDate(p) }
}
