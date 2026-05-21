import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

const SAVINGS_FUND = "/sim"

export default auth((req) => {
  const { nextUrl } = req

  // 미인증 사용자 → 로그인
  const publicPaths = ["/login", "/register"]
  if (!req.auth && !publicPaths.includes(nextUrl.pathname)) {
    return NextResponse.redirect(new URL("/login", nextUrl.origin))
  }

  if (req.auth) {
    const role = (req.auth.user as { role?: string })?.role

    // admin 이외 계정이 대시보드("/pension/my") 접근 → savings-fund로
    if (role !== "admin" && nextUrl.pathname === "/pension/my") {
      return NextResponse.redirect(new URL(SAVINGS_FUND, nextUrl.origin))
    }
  }
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
