import AppLayout from "@/components/AppLayout"
import Link from "next/link"

const SUB_MENUS = [
  {
    href: "/sim",
    title: "연금저축펀드",
    desc: "세액공제 혜택을 받는 장기 펀드 투자",
    icon: "📈",
  },
  {
    href: "/magic",
    title: "복리의 마법",
    desc: "복리 수익 시뮬레이션",
    icon: "✨",
  },
]

export default function PersonalPensionPage() {
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">개인연금</h1>
          <p className="text-gray-500 text-sm">개인연금 계좌별 현황을 확인하세요</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">연금저축펀드 평가액</p>
            <p className="text-xl font-bold text-gray-900">- 원</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">IRP 평가액</p>
            <p className="text-xl font-bold text-gray-900">- 원</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">ISA 평가액</p>
            <p className="text-xl font-bold text-gray-900">- 원</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SUB_MENUS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-purple-300 hover:bg-purple-50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <h2 className="font-semibold text-gray-900">{item.title}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{item.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
