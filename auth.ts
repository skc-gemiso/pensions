import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { ensureAuthTables, sha256, findUser, getMenusForRole, type MenuRow } from "@/lib/auth-db"

export const { handlers, auth, signIn, signOut } = NextAuth({
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
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.name    = user.name ?? token.name
        token.role    = (user as { role?: string }).role
        token.loginAt = (user as { loginAt?: string }).loginAt
        token.menus   = (user as { menus?: MenuRow[] }).menus
      }
      return token
    },
    session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          name:    token.name    as string    | undefined,
          role:    token.role    as string    | undefined,
          loginAt: token.loginAt as string    | undefined,
          menus:   token.menus   as MenuRow[] | undefined,
        },
      }
    },
  },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
})
