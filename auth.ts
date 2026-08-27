import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { createHmac } from "crypto"
import { authConfig, applyIdleExpiry } from "./auth.config"
import { ensureAuthTables, ensureMigrations, sha256, findUser, findUserByEmail } from "@/lib/auth-db"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      credentials: {
        username: { label: "아이디", type: "text" },
        password: { label: "비밀번호", type: "password" },
      },
      authorize: async (credentials) => {
        await ensureAuthTables()
        await ensureMigrations()

        const user = await findUser(String(credentials?.username ?? ""))
        if (!user) return null
        if (sha256(String(credentials?.password ?? "")) !== user.password_hash) return null

        // 메뉴는 토큰에 담지 않는다 — app/actions/menus.ts 가 매번 DB 에서 읽는다
        return {
          id: user.id,
          name: user.name,
          role: user.role,
          loginAt: new Date().toISOString(),
        }
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        await ensureAuthTables()
        await ensureMigrations()
        const email = profile?.email ?? ""
        const dbUser = await findUserByEmail(email)
        if (!dbUser) {
          const expiry = Date.now() + 30 * 60 * 1000
          const sig = createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`${email}:${expiry}`).digest("hex")
          const token = `${sig}.${expiry}`
          const params = new URLSearchParams({ email, name: profile?.name ?? "", token })
          return `/register?${params}`
        }
      }
      return true
    },
    async jwt({ token, user, account, profile, trigger }) {
      if (user) {
        const u = user as Record<string, unknown>
        token.role    = u.role    as string | undefined
        token.loginAt = u.loginAt as string | undefined
      }
      if (account?.provider === "google" && profile?.email) {
        const dbUser = await findUserByEmail(profile.email)
        if (dbUser) {
          token.name    = dbUser.name
          token.role    = dbUser.role
          token.loginAt = new Date().toISOString()
        }
      }
      // 무활동 30분 만료 검사 — auth.config.ts 와 같은 규칙
      return applyIdleExpiry(token, trigger)
    },
  },
})
