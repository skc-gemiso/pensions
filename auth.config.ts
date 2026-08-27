import type { NextAuthConfig } from "next-auth"
import type { JWT } from "next-auth/jwt"

/**
 * 무활동 세션 만료 — 30분.
 *
 * 화면(AppLayout)에도 30분 카운트다운이 있지만 그건 클라이언트 `setTimeout` 이라
 * 탭을 닫거나 모바일에서 백그라운드로 보내면 동작하지 않는다.
 * 그래서 토큰의 `loginAt` 을 서버에서 매번 검사한다 — 미들웨어·서버 액션 모두 이 경로를 탄다.
 */
export const SESSION_IDLE_MS = 30 * 60 * 1000

/**
 * 마지막 활동 이후 30분이 지났으면 만료.
 *
 * 사용자가 움직이면 화면이 `update()` 를 불러 `loginAt` 을 갱신하므로,
 * 쓰는 동안에는 만료되지 않는다.
 */
export function isSessionExpired(loginAt: unknown): boolean {
  if (typeof loginAt !== "string") return false // 값이 없으면 판단하지 않는다
  const t = Date.parse(loginAt)
  if (Number.isNaN(t)) return false
  return Date.now() - t > SESSION_IDLE_MS
}

/** 로그인·활동 시각을 기록하고, 만료됐으면 null 을 돌려 세션을 끊는다 */
export function applyIdleExpiry(token: JWT, trigger?: string): JWT | null {
  if (trigger === "update") token.loginAt = new Date().toISOString()
  return isSessionExpired(token.loginAt) ? null : token
}

export const authConfig = {
  pages: { signIn: "/login", error: "/login" },
  secret: process.env.AUTH_SECRET,
  providers: [],
  callbacks: {
    jwt({ token, user, trigger }) {
      if (user) {
        const u = user as Record<string, unknown>
        token.role    = u.role    as string | undefined
        token.loginAt = u.loginAt as string | undefined
      }
      return applyIdleExpiry(token, trigger)
    },
    session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          name:    token.name    as string | undefined,
          role:    token.role    as string | undefined,
          loginAt: token.loginAt as string | undefined,
        },
      }
    },
  },
} satisfies NextAuthConfig
