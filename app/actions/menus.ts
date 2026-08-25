"use server"

import { auth } from "@/auth"
import { getMenusForRole, type MenuRow } from "@/lib/auth-db"

/**
 * 로그인한 역할의 메뉴를 DB 에서 읽는다.
 *
 * 예전에는 로그인 시점의 메뉴를 JWT 에 넣어 두고 세션에서 꺼내 썼는데,
 * 메뉴 구조를 바꿔도 기존 세션에는 반영되지 않아 재로그인해야 했다
 * (세션 쿠키가 30일이라 모바일에서는 특히 오래 남았다).
 * 이제 화면이 뜰 때마다 조회해서 항상 최신 구조를 보여준다.
 */
export async function getMyMenus(): Promise<MenuRow[]> {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!role) return []
  return getMenusForRole(role)
}
