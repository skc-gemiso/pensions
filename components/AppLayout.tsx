"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
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
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
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

      <div className="flex flex-1">
        <nav className="w-52 bg-white border-r border-gray-200 p-4 shrink-0">
          {status === "loading" ? (
            <div className="h-4 bg-gray-100 rounded animate-pulse" />
          ) : (
            <ul className="space-y-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive(item.href) && !item.children
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : item.children && isActive(item.href)
                          ? "text-blue-700 font-medium"
                          : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                  {item.children && (
                    <ul className="mt-1 ml-3 space-y-1">
                      {item.children.map((child) => (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            className={`block px-3 py-1.5 rounded-lg text-sm transition-colors ${
                              path === child.href
                                ? "bg-blue-50 text-blue-700 font-medium"
                                : "text-gray-500 hover:bg-gray-100"
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
      </div>
    </div>
  )
}
