import { redirect } from "next/navigation"
import RegisterForm from "./RegisterForm"

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; name?: string; token?: string }>
}) {
  const { email = "", name = "", token = "" } = await searchParams

  if (!email || !token) redirect("/login")

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-blue-700">연금 관리</h1>
          <p className="mt-1 text-sm text-gray-500">신규 계정 등록</p>
        </div>
        <RegisterForm email={email} name={name} token={token} />
      </div>
    </div>
  )
}
