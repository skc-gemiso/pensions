import AppLayout from "@/components/AppLayout"
import Link from "next/link"
import { RetirementNavCard } from "@/components/RetirementDashboardCard"
import { NationalPensionNavCard } from "@/components/NationalPensionDashboardCard"

const OTHER_NAV_CARDS = [
  {
    href: "/pension/per",
    title: "개인연금",
    desc: "연금저축펀드 / IRP / ISA",
    bg: "bg-purple-50 border-purple-200",
    iconColor: "text-purple-600",
    btnColor: "bg-purple-100 hover:bg-purple-200 text-purple-500",
    icon: "💼",
  },
  {
    href: "/pension/seni",
    title: "노령연금",
    desc: "수급 조건 및 수령 예상",
    bg: "bg-orange-50 border-orange-200",
    iconColor: "text-orange-600",
    btnColor: "bg-orange-100 hover:bg-orange-200 text-orange-500",
    icon: "🌅",
  },
]

export default function DashboardPage() {
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">나의 연금 현황</h1>
          <p className="text-gray-500 text-sm">모든 연금 계좌를 한눈에 확인하세요</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NationalPensionNavCard />
          <RetirementNavCard />
          {OTHER_NAV_CARDS.map((card) => (
            <div
              key={card.href}
              className={`rounded-xl border p-5 ${card.bg}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{card.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center mb-1">
                    <h2 className={`font-bold text-lg ${card.iconColor}`}>{card.title}</h2>
                    <Link
                      href={card.href}
                      className={`ml-auto flex items-center justify-center w-7 h-7 rounded-full ${card.btnColor} transition-colors`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                  <p className="text-sm text-gray-600">{card.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
