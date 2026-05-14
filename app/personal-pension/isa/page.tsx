import AppLayout from "@/components/AppLayout"

export default function IsaPage() {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">ISA (개인종합자산관리계좌)</h1>
          <p className="text-gray-500 text-sm">비과세·분리과세 혜택으로 다양한 금융상품에 투자</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">총 납입액</p>
            <p className="text-xl font-bold text-gray-900">- 원</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">평가액</p>
            <p className="text-xl font-bold text-gray-900">- 원</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">수익률</p>
            <p className="text-xl font-bold text-gray-900">- %</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">연간 납입 한도</p>
            <p className="text-xl font-bold text-purple-700">2,000만 원</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">비과세 한도 (서민형)</p>
            <p className="text-lg font-bold text-gray-900">400만 원</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">비과세 한도 (일반형)</p>
            <p className="text-lg font-bold text-gray-900">200만 원</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">보유 상품 현황</h2>
          <p className="text-gray-400 text-sm">ISA 계좌 보유 상품 데이터를 입력하세요.</p>
        </div>
      </div>
    </AppLayout>
  )
}
