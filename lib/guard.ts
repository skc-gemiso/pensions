import { auth } from "@/auth"

/**
 * 서버 액션·API 라우트의 접근 통제.
 *
 * 미들웨어는 화면 경로만 막는다. 서버 액션은 POST 엔드포인트라 화면을 못 보더라도
 * 액션 ID만 알면 호출되고, API 라우트는 미들웨어 matcher에서 아예 제외돼 있다.
 * 그래서 데이터에 닿는 지점마다 여기서 다시 확인한다.
 */

type SessionUser = { role?: string }

/** 로그인 필요 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  return session.user as SessionUser
}

/** admin 전용 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role !== "admin") throw new Error("Forbidden")
  return user
}

/** API 라우트용 — 예외 대신 401/403 응답을 돌려준다 */
export async function guardApi(adminOnly = true): Promise<Response | null> {
  const session = await auth()
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    })
  }
  if (adminOnly && (session.user as SessionUser).role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { "content-type": "application/json" },
    })
  }
  return null
}
