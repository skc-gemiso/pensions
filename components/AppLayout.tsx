"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { logout } from "@/app/actions/auth"

type NavItem = {
  href: string
  label: string
  children?: { href: string; label: string }[]
}

const NAV_ALL: NavItem[] = [
  { href: "/", label: "나의 연금 현황" },
  { href: "/national-pension", label: "국민연금" },
  { href: "/retirement-pension", label: "퇴직연금" },
  {
    href: "/personal-pension",
    label: "개인연금",
    children: [
      { href: "/personal-pension/savings-fund", label: "연금투자 시뮬레이션" },
      { href: "/personal-pension/irp", label: "IRP" },
      { href: "/personal-pension/isa", label: "ISA" },
      { href: "/personal-pension/compound-magic", label: "복리의 마법" },
    ],
  },
  { href: "/senior-pension", label: "노령연금" },
]

const NAV_SAVINGS_ONLY: NavItem[] = [
  {
    href: "/personal-pension",
    label: "개인연금",
    children: [
      { href: "/personal-pension/savings-fund", label: "연금투자 시뮬레이션" },
    ],
  },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role ?? "admin"

  const NAV = role === "admin" ? NAV_ALL : NAV_SAVINGS_ONLY

  const isActive = (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(href + "/")

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <span className="font-bold text-blue-700 text-base">연금 관리</span>
        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            로그아웃
          </button>
        </form>
      </header>

      <div className="flex flex-1">
        <nav className="w-52 bg-white border-r border-gray-200 p-4 shrink-0">
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
        </nav>

        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
