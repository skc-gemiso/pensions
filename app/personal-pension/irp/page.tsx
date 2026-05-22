import AppLayout from "@/components/AppLayout"

export default function IrpPage() {
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">IRP (개인형 퇴직연금)</h1>
          <p className="text-gray-500 text-sm">추가 세액공제 및 퇴직급여를 통합 운용하는 계좌</p>
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
            <p className="text-xs text-gray-500 mb-1">세액공제 한도</p>
            <p className="text-xl font-bold text-purple-700">900만 원</p>
            <p className="text-xs text-gray-400">(연금저축 포함)</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">운용 현황</h2>
          <p className="text-gray-400 text-sm">IRP 계좌 운용 데이터를 입력하세요.</p>
        </div>
      </div>
    </AppLayout>
  )
}
