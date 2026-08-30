"use server"

import { requireAdmin } from "@/lib/guard"
import { retSettingsFromEnv, type RetSettings } from "@/lib/settings"

/**
 * 퇴직금 산정 기준 (`PENSION_RET_*`).
 *
 * 화면이 클라이언트 컴포넌트라 서버 전용인 `lib/settings.ts` 를 직접 import 할 수 없다.
 * 개인연금의 `getPerConfig()` 와 같은 모양이다.
 */
export async function getRetConfig(): Promise<RetSettings> {
  await requireAdmin()
  return retSettingsFromEnv()
}
