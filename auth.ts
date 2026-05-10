import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { authConfig } from "./auth.config"
import { ensureAuthTables, sha256, findUser, getMenusForRole, type MenuRow } from "@/lib/auth-db"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers: [
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
})
