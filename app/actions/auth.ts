"use server"

import { signIn, signOut } from "@/auth"
import { AuthError } from "next-auth"

export async function login(
  _prev: { error?: string } | undefined,
  formData: FormData
) {
  try {
    await signIn("credentials", {
      username: formData.get("username"),
      password: formData.get("password"),
      redirectTo: "/",
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "아이디 또는 비밀번호가 올바르지 않습니다." }
    }
    throw error
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" })
}
