import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

const SAVINGS_FUND = "/personal-pension/savings-fund"

// 로그인 없이 접근 가능한 경로
const PUBLIC_PATHS = [SAVINGS_FUND]

export default auth((req) => {
  const { nextUrl } = req

  const isPublic = PUBLIC_PATHS.some(
    (p) => nextUrl.pathname === p || nextUrl.pathname.startsWith(p + "/")
  )

  // 미인증 사용자 → 로그인 (공개 경로 제외)
  if (!req.auth && nextUrl.pathname !== "/login" && !isPublic) {
    return NextResponse.redirect(new URL("/login", nextUrl.origin))
  }

  if (req.auth) {
    const role = (req.auth.user as { role?: string })?.role

    // admin 이외 계정이 대시보드("/") 접근 → savings-fund로
    if (role !== "admin" && nextUrl.pathname === "/") {
      return NextResponse.redirect(new URL(SAVINGS_FUND, nextUrl.origin))
    }
  }
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
