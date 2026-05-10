import AppLayout from "@/components/AppLayout"
import Link from "next/link"

const PENSION_CARDS = [
  {
    href: "/national-pension",
    title: "국민연금",
    desc: "납부 내역 및 예상 수령액",
    color: "bg-blue-50 border-blue-200 hover:bg-blue-100",
    iconColor: "text-blue-600",
    icon: "🏛️",
  },
  {
    href: "/retirement-pension",
    title: "퇴직연금",
    desc: "DB형 / DC형 / IRP 현황",
    color: "bg-green-50 border-green-200 hover:bg-green-100",
    iconColor: "text-green-600",
    icon: "🏢",
  },
  {
    href: "/personal-pension",
    title: "개인연금",
    desc: "연금저축펀드 / IRP / ISA",
    color: "bg-purple-50 border-purple-200 hover:bg-purple-100",
    iconColor: "text-purple-600",
    icon: "💼",
  },
  {
    href: "/senior-pension",
    title: "노령연금",
    desc: "수급 조건 및 수령 예상",
    color: "bg-orange-50 border-orange-200 hover:bg-orange-100",
    iconColor: "text-orange-600",
    icon: "🌅",
  },
]

export default function DashboardPage() {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">나의 연금 현황</h1>
          <p className="text-gray-500 text-sm">모든 연금 계좌를 한눈에 확인하세요</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 mb-8 lg:grid-cols-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">국민연금 예상 월 수령액</p>
            <p className="text-xl font-bold text-gray-900">-</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">퇴직연금 적립금</p>
            <p className="text-xl font-bold text-gray-900">-</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">개인연금 총 평가액</p>
            <p className="text-xl font-bold text-gray-900">-</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">전체 연금 합계</p>
            <p className="text-xl font-bold text-blue-700">-</p>
          </div>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PENSION_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className={`block rounded-xl border p-5 transition-colors ${card.color}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{card.icon}</span>
                <div>
                  <h2 className={`font-semibold text-base ${card.iconColor}`}>{card.title}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{card.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
