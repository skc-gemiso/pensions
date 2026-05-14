"use server"

import { signIn, signOut } from "@/auth"
import { AuthError } from "next-auth"
import { cookies } from "next/headers"
import { createHmac } from "crypto"
import { findUser, createUser } from "@/lib/auth-db"

export async function login(
  _prev: { error?: string; redirect?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; redirect?: string } | undefined> {
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
    // signIn 성공 시 Next.js가 NEXT_REDIRECT를 throw — role에 따라 리다이렉트
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
      const user = await findUser(String(formData.get("username") ?? ""))
      const redirectTo = user?.role === "admin"
        ? "/"
        : "/personal-pension/savings-fund"
      return { redirect: redirectTo }
    }
    throw error
  }
}

export async function loginWithGoogle() {
  await signIn("google", { redirectTo: "/" })
}

export async function registerAndLogin(formData: FormData) {
  const email = String(formData.get("email") ?? "")
  const name  = String(formData.get("name")  ?? "")
  const token = String(formData.get("token") ?? "")

  const expected = createHmac("sha256", process.env.AUTH_SECRET ?? "").update(email).digest("hex")
  if (token !== expected) throw new Error("유효하지 않은 요청입니다.")

  await createUser(email, name)
  await signIn("google", { redirectTo: "/" })
}

export async function logout() {
  const jar = await cookies()
  for (const name of [
    "authjs.session-token",
    "authjs.session-token.0",
    "authjs.callback-url",
    "authjs.csrf-token",
    "__Secure-authjs.session-token",
    "__Secure-authjs.callback-url",
    "__Host-authjs.csrf-token",
  ]) {
    jar.delete(name)
  }
  await signOut({ redirectTo: "/login" })
}
