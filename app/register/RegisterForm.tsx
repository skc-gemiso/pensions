"use client"

import { useFormStatus } from "react-dom"
import { registerAndLogin } from "@/app/actions/auth"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors"
    >
      {pending ? "등록 중..." : "등록하고 로그인"}
    </button>
  )
}

export default function RegisterForm({
  email,
  name,
  token,
}: {
  email: string
  name: string
  token: string
}) {
  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-lg p-4 text-sm">
        <p className="font-medium text-gray-800">{name || email}</p>
        <p className="text-gray-500 mt-0.5">{email}</p>
      </div>
      <p className="text-sm text-gray-600 text-center">
        이 Google 계정으로 등록하시겠습니까?
      </p>
      <form action={registerAndLogin} className="space-y-3">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="name"  value={name}  />
        <input type="hidden" name="token" value={token} />
        <SubmitButton />
      </form>
      <a
        href="/login"
        className="block w-full py-2.5 text-center border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        취소
      </a>
    </div>
  )
}
