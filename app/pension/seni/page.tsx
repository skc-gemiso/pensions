import AppLayout from "@/components/AppLayout"

export default function SeniorPensionPage() {
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">노령연금</h1>
          <p className="text-gray-500 text-sm">국민연금 노령연금 수급 조건 및 예상 수령액</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-700 mb-1">수급 개시 연령</p>
            <p className="text-xl font-bold text-gray-900">만 65세</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-700 mb-1">최소 가입 기간</p>
            <p className="text-xl font-bold text-gray-900">10년</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-700 mb-1">예상 월 수령액</p>
            <p className="text-xl font-bold text-orange-600">- 원</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">조기노령연금</h2>
            <p className="text-sm text-gray-500 mb-2">가입기간 10년 이상, 최대 5년 앞당겨 수령</p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li className="flex justify-between"><span>5년 조기 (60세)</span><span className="text-red-500">70%</span></li>
              <li className="flex justify-between"><span>4년 조기 (61세)</span><span className="text-red-400">76%</span></li>
              <li className="flex justify-between"><span>3년 조기 (62세)</span><span className="text-orange-400">82%</span></li>
              <li className="flex justify-between"><span>2년 조기 (63세)</span><span className="text-yellow-500">88%</span></li>
              <li className="flex justify-between"><span>1년 조기 (64세)</span><span className="text-yellow-400">94%</span></li>
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">연기노령연금</h2>
            <p className="text-sm text-gray-500 mb-2">최대 5년 연기, 연 7.2% 추가 지급</p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li className="flex justify-between"><span>1년 연기 (66세)</span><span className="text-green-500">107.2%</span></li>
              <li className="flex justify-between"><span>2년 연기 (67세)</span><span className="text-green-500">114.4%</span></li>
              <li className="flex justify-between"><span>3년 연기 (68세)</span><span className="text-green-600">121.6%</span></li>
              <li className="flex justify-between"><span>4년 연기 (69세)</span><span className="text-green-600">128.8%</span></li>
              <li className="flex justify-between"><span>5년 연기 (70세)</span><span className="text-green-700">136.0%</span></li>
            </ul>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">나의 노령연금 추정</h2>
          <p className="text-gray-400 text-sm">국민연금공단 데이터를 연동하거나 직접 입력하세요.</p>
        </div>
      </div>
    </AppLayout>
  )
}
