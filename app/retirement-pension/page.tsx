import AppLayout from "@/components/AppLayout"

export default function RetirementPensionPage() {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">퇴직연금</h1>
          <p className="text-gray-500 text-sm">확정급여형(DB) / 확정기여형(DC) / IRP 현황</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">DB형 적립금</p>
            <p className="text-xl font-bold text-gray-900">- 원</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">DC형 적립금</p>
            <p className="text-xl font-bold text-gray-900">- 원</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">총 적립금</p>
            <p className="text-xl font-bold text-green-700">- 원</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">퇴직연금 운용 현황</h2>
          <p className="text-gray-400 text-sm">데이터를 입력하거나 API를 연결하세요.</p>
        </div>
      </div>
    </AppLayout>
  )
}
