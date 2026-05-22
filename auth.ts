import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { createHmac } from "crypto"
import { authConfig } from "./auth.config"
import { ensureAuthTables, sha256, findUser, findUserByEmail, getMenusForRole, type MenuRow } from "@/lib/auth-db"

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

        const user = await findUser(String(credentials?.username ?? ""))
        if (!user) return null
        if (sha256(String(credentials?.password ?? "")) !== user.password_hash) return null

        const menus = await getMenusForRole(user.role)
        const loginAt = new Date().toISOString()

        return {
          id: user.id,
          name: user.name,
          role: user.role,
          loginAt,
          menus,
        } as ReturnType<typeof Object.assign> & { menus: MenuRow[] }
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        await ensureAuthTables()
        const email = profile?.email ?? ""
        const dbUser = await findUserByEmail(email)
        if (!dbUser) {
          const token = createHmac("sha256", process.env.AUTH_SECRET ?? "").update(email).digest("hex")
          const params = new URLSearchParams({ email, name: profile?.name ?? "", token })
          return `/register?${params}`
        }
      }
      return true
    },
    async jwt({ token, user, account, profile }) {
      if (user) {
        const u = user as Record<string, unknown>
        token.role    = u.role    as string | undefined
        token.loginAt = u.loginAt as string | undefined
        token.menus   = u.menus
      }
      if (account?.provider === "google" && profile?.email) {
        const dbUser = await findUserByEmail(profile.email)
        if (dbUser) {
          const menus = await getMenusForRole(dbUser.role)
          token.name    = dbUser.name
          token.role    = dbUser.role
          token.loginAt = new Date().toISOString()
          token.menus   = menus
        }
      }
      return token
    },
  },
})
