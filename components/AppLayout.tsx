"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { useState, useEffect } from "react"
import { logout } from "@/app/actions/auth"
import { getVisitorIp } from "@/app/actions/visitor"
import type { MenuRow } from "@/lib/auth-db"

type NavItem = {
  href: string
  label: string
  children?: { href: string; label: string }[]
}

function buildNavTree(menus: MenuRow[]): NavItem[] {
  const roots = menus
    .filter((m) => !m.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order)

  return roots.map((root) => {
    const children = menus
      .filter((m) => m.parent_id === root.id)
      .sort((a, b) => a.sort_order - b.sort_order)

    return {
      href: root.href,
      label: root.label,
      ...(children.length > 0
        ? { children: children.map((c) => ({ href: c.href, label: c.label })) }
        : {}),
    }
  })
}

function fmtTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function maskIp(ip: string): string {
  if (!ip || ip === "unknown") return ""
  const v4 = ip.split(".")
  if (v4.length === 4) return `${v4[0]}.${v4[1]}.xxx.xxx`
  const v6 = ip.split(":")
  if (v6.length >= 4) return `${v6[0]}:${v6[1]}:xxxx:…`
  return ""
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const { data: session, status } = useSession()
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const user = session?.user as {
    role?: string
    name?: string
    loginAt?: string
    menus?: MenuRow[]
  } | undefined

  const rawMenus = status === "authenticated" ? (user?.menus ?? []) : []
  const NAV = buildNavTree(rawMenus)

  const isActive = (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(href + "/")

  const initials = user?.name ? user.name.slice(0, 1) : "?"

  const [mountTime, setMountTime] = useState("")
  useEffect(() => { setMountTime(fmtTime(new Date())) }, [])
  const [visitorIp, setVisitorIp] = useState<string>("")
  useEffect(() => {
    if (status === "unauthenticated") {
      getVisitorIp().then(setVisitorIp).catch(() => {})
    }
  }, [status])

  // 라우트 이동 시 모바일 메뉴 닫기
  useEffect(() => { setMobileMenuOpen(false) }, [path])

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* 헤더 */}
      <header className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 sticky top-0 z-20 shadow-lg">
        <div className="px-4 md:px-6 flex items-stretch h-14">

          {/* 좌: 로고 */}
          <div className="flex items-center gap-3 flex-shrink-0 md:pr-6">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                <rect x="3"  y="13" width="4" height="8" rx="1" fill="white" opacity="0.85"/>
                <rect x="10" y="8"  width="4" height="13" rx="1" fill="white"/>
                <rect x="17" y="4"  width="4" height="17" rx="1" fill="white" opacity="0.85"/>
              </svg>
            </div>
            <div className="leading-tight">
              <p className="font-bold text-white text-sm">연금 관리</p>
              <p className="text-[10px] text-blue-200">Pension Manager</p>
            </div>
          </div>

          {/* 구분선 (데스크톱) */}
          <div className="hidden md:block w-px bg-white/15 my-2.5 flex-shrink-0" />

          {/* 중앙: 네비게이션 (데스크톱) */}
          <nav className="hidden md:flex flex-1 justify-center">
            {status === "loading" ? (
              <div className="flex items-center px-4">
                <div className="h-3 w-48 bg-white/20 rounded animate-pulse" />
              </div>
            ) : (
              <ul className="flex items-center gap-0.5 px-4">
                {NAV.map((item) => (
                  <li
                    key={item.href}
                    className="relative"
                    onMouseEnter={() => item.children && setOpenMenu(item.href)}
                    onMouseLeave={() => setOpenMenu(null)}
                  >
                    <Link
                      href={item.href}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                        isActive(item.href)
                          ? "bg-white text-blue-700 shadow-sm"
                          : "text-white/85 hover:text-white hover:bg-white/15"
                      }`}
                    >
                      {item.label}
                      {item.children && (
                        <svg
                          className={`w-3 h-3 transition-transform duration-150 ${openMenu === item.href ? "rotate-180" : ""}`}
                          viewBox="0 0 12 12"
                          fill="currentColor"
                        >
                          <path d="M6 8L1 3h10z" />
                        </svg>
                      )}
                    </Link>

                    {/* 드롭다운 */}
                    {item.children && openMenu === item.href && (
                      <div className="absolute top-full left-0 z-30 pt-1.5">
                      <ul className="min-w-[180px] bg-white rounded-xl shadow-xl border border-gray-100 py-1.5">
                        {item.children.map((child) => (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              className={`flex items-center gap-2 mx-1.5 px-3 py-2 text-sm rounded-lg transition-colors ${
                                path === child.href
                                  ? "bg-blue-50 text-blue-700 font-medium"
                                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                              }`}
                            >
                              {path === child.href && (
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                              )}
                              {child.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </nav>

          {/* 구분선 (데스크톱) */}
          <div className="hidden md:block w-px bg-white/15 my-2.5 flex-shrink-0" />

          {/* 우: 사용자 정보 (데스크톱) */}
          <div className="hidden md:flex items-center gap-3 flex-shrink-0 pl-6">
            {status === "authenticated" ? (
              <>
                <div className="w-8 h-8 rounded-full bg-white/25 border-2 border-white/40 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {initials}
                </div>
                <div className="leading-tight">
                  <p className="text-white text-sm font-medium">{user?.name ?? ""}</p>
                  {mountTime && (
                    <p className="text-blue-200 text-xs flex items-center gap-1">
                      <svg viewBox="0 0 16 16" className="w-3 h-3 flex-shrink-0" fill="currentColor">
                        <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-3.5a.75.75 0 0 1 .75.75v3.19l1.9 1.9a.75.75 0 0 1-1.06 1.06l-2.13-2.13A.75.75 0 0 1 7.25 9V5.25A.75.75 0 0 1 8 4.5Z"/>
                      </svg>
                      {mountTime} 접속
                    </p>
                  )}
                </div>
                <form action={logout}>
                  <button
                    type="submit"
                    className="text-xs text-white/80 border border-white/25 rounded-lg px-3 py-1.5 hover:bg-white/15 hover:text-white transition-colors"
                  >
                    로그아웃
                  </button>
                </form>
              </>
            ) : status === "unauthenticated" ? (
              <>
                <div className="w-8 h-8 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-white/70 text-sm flex-shrink-0">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                  </svg>
                </div>
                <div className="leading-tight">
                  <p className="text-white/90 text-sm font-medium">방문자</p>
                  {visitorIp && visitorIp !== "unknown" && (
                    <p className="text-blue-200 text-[10px] font-mono">{maskIp(visitorIp)}</p>
                  )}
                </div>
                <Link
                  href="/login"
                  className="text-xs text-white/80 border border-white/25 rounded-lg px-3 py-1.5 hover:bg-white/15 hover:text-white transition-colors"
                >
                  로그인
                </Link>
              </>
            ) : null}
          </div>

          {/* 모바일 우: 아바타 + 햄버거 */}
          <div className="flex md:hidden items-center gap-2 ml-auto">
            {status === "authenticated" && (
              <div className="w-8 h-8 rounded-full bg-white/25 border-2 border-white/40 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {initials}
              </div>
            )}
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="text-white p-1.5 rounded-lg hover:bg-white/15 transition-colors"
              aria-label="메뉴"
            >
              {mobileMenuOpen ? (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor">
                  <path d="M5.293 5.293a1 1 0 011.414 0L11 9.586l4.293-4.293a1 1 0 111.414 1.414L12.414 11l4.293 4.293a1 1 0 01-1.414 1.414L11 12.414l-4.293 4.293a1 1 0 01-1.414-1.414L9.586 11 5.293 6.707a1 1 0 010-1.414z"/>
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor">
                  <path d="M3 6a1 1 0 011-1h14a1 1 0 110 2H4a1 1 0 01-1-1zM3 11a1 1 0 011-1h14a1 1 0 110 2H4a1 1 0 01-1-1zM3 16a1 1 0 011-1h14a1 1 0 110 2H4a1 1 0 01-1-1z"/>
                </svg>
              )}
            </button>
          </div>

        </div>

        {/* 모바일 메뉴 */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/20 bg-blue-800/98">
            <nav className="px-3 py-2 space-y-0.5">
              {NAV.map((item) => (
                <div key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive(item.href)
                        ? "bg-white/20 text-white"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                  {item.children?.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`flex items-center pl-8 pr-3 py-2 rounded-lg text-sm transition-colors ${
                        path === child.href
                          ? "bg-white/15 text-white font-medium"
                          : "text-white/65 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {path === child.href && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-300 mr-2 flex-shrink-0" />
                      )}
                      {child.label}
                    </Link>
                  ))}
                </div>
              ))}
            </nav>

            {/* 모바일 사용자 정보 + 로그아웃 */}
            {status === "authenticated" && (
              <div className="mx-3 mb-3 pt-2 border-t border-white/20">
                <div className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-white text-sm font-medium">{user?.name ?? ""}</p>
                    {mountTime && (
                      <p className="text-blue-200 text-xs">{mountTime} 접속</p>
                    )}
                  </div>
                  <form action={logout}>
                    <button
                      type="submit"
                      className="text-xs text-white/80 border border-white/25 rounded-lg px-3 py-1.5 hover:bg-white/15 hover:text-white transition-colors"
                    >
                      로그아웃
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>

      <footer className="bg-white border-t border-gray-200 px-4 py-3">
        <p className="text-center text-xs text-gray-400 leading-relaxed">
          © {new Date().getFullYear()} 신기철 (skc). All rights reserved.
          <span className="mx-1.5 text-gray-300">|</span>
          개인 학습 및 참고 목적으로 제공되며 투자 권유가 아닙니다.
        </p>
      </footer>
    </div>
  )
}
