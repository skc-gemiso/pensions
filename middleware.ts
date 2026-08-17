import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

const SAVINGS_FUND = "/sim"

/**
 * admin 이 아닌 계정이 들어갈 수 있는 경로.
 * 메뉴에서 숨기는 것만으로는 주소를 직접 입력하면 열리므로 여기서 막는다.
 * 데이터에 닿는 서버 액션·API 는 lib/guard.ts 에서 다시 확인한다.
 */
const NORMAL_ALLOWED = ["/sim", "/magic"]

function isAllowedForNormal(pathname: string): boolean {
  return NORMAL_ALLOWED.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

export default auth((req) => {
  const { nextUrl } = req

  // 미인증 사용자 → 로그인
  const publicPaths = ["/login", "/register"]
  if (!req.auth && !publicPaths.includes(nextUrl.pathname)) {
    return NextResponse.redirect(new URL("/login", nextUrl.origin))
  }

  if (req.auth) {
    const role = (req.auth.user as { role?: string })?.role

    // admin 이외 계정은 허용 경로 밖으로 나가면 sim 으로 돌린다
    if (role !== "admin"
        && !isAllowedForNormal(nextUrl.pathname)
        && !publicPaths.includes(nextUrl.pathname)) {
      return NextResponse.redirect(new URL(SAVINGS_FUND, nextUrl.origin))
    }
  }
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
