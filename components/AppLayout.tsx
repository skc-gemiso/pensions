"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { useState } from "react"
import { logout } from "@/app/actions/auth"
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

function formatLoginAt(iso: string | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}. ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const { data: session, status } = useSession()
  const [openMenu, setOpenMenu] = useState<string | null>(null)

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

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* 1행: 브랜드 + 사용자 정보 + 로그아웃 */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <span className="font-bold text-blue-700 text-base">연금 관리</span>
        <div className="flex items-center gap-4">
          {status === "authenticated" && (
            <span className="text-sm text-gray-600">
              <span className="font-semibold text-gray-800">{user?.name ?? ""}</span>
              {user?.loginAt && (
                <span className="text-gray-400 ml-1">{` [로그인 : ${formatLoginAt(user.loginAt)}]`}</span>
              )}
            </span>
          )}
          <form action={logout}>
            <button
              type="submit"
              className="text-sm text-gray-600 border border-gray-300 rounded-md px-3 py-1 hover:bg-gray-100 hover:border-gray-400 transition-colors"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>

      {/* 2행: 상단 네비게이션 */}
      <nav className="bg-white border-b border-gray-200 px-6 sticky top-[52px] z-10">
        {status === "loading" ? (
          <div className="h-10 flex items-center">
            <div className="h-3 w-48 bg-gray-100 rounded animate-pulse" />
          </div>
        ) : (
          <ul className="flex items-stretch gap-1">
            {NAV.map((item) => (
              <li
                key={item.href}
                className="relative"
                onMouseEnter={() => item.children && setOpenMenu(item.href)}
                onMouseLeave={() => setOpenMenu(null)}
              >
                <Link
                  href={item.href}
                  className={`inline-flex items-center gap-1 px-3 py-3 text-sm transition-colors border-b-2 ${
                    isActive(item.href)
                      ? "border-blue-600 text-blue-700 font-medium"
                      : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
                  }`}
                >
                  {item.label}
                  {item.children && (
                    <svg className="w-3 h-3 opacity-50" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M6 8L1 3h10z" />
                    </svg>
                  )}
                </Link>

                {/* 드롭다운 */}
                {item.children && openMenu === item.href && (
                  <ul className="absolute top-full left-0 min-w-[160px] bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-30">
                    {item.children.map((child) => (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          className={`block px-4 py-2 text-sm transition-colors ${
                            path === child.href
                              ? "bg-blue-50 text-blue-700 font-medium"
                              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          }`}
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </nav>

      <main className="flex-1 p-6 overflow-auto">{children}</main>

      <footer className="bg-white border-t border-gray-200 px-6 py-3">
        <p className="text-center text-xs text-gray-400">
          © {new Date().getFullYear()} 신기철 (Shin Ki-chul). All rights reserved.
          <span className="mx-2 text-gray-300">|</span>
          개인 학습 및 참고 목적으로 제공되며 투자 권유가 아닙니다.
        </p>
      </footer>
    </div>
  )
}
