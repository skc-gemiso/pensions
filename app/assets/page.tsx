import AppLayout from "@/components/AppLayout"

export default function ComingSoonPage() {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto flex items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <p className="text-4xl mb-4">🚧</p>
          <h1 className="text-xl font-bold text-gray-700 mb-2">준비 중입니다</h1>
          <p className="text-sm text-gray-400">서비스 준비 중입니다. 조금만 기다려 주세요.</p>
        </div>
      </div>
    </AppLayout>
  )
}
