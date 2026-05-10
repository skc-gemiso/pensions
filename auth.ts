import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "아이디", type: "text" },
        password: { label: "비밀번호", type: "password" },
      },
      authorize: async (credentials) => {
        if (
          credentials?.username === process.env.ADMIN_USERNAME &&
          credentials?.password === process.env.ADMIN_PASSWORD
        ) {
          return { id: "1", name: credentials.username as string, role: "admin" }
        }
        if (
          credentials?.username === process.env.NORMAL_USERNAME &&
          credentials?.password === process.env.NORMAL_PASSWORD
        ) {
          return { id: "2", name: credentials.username as string, role: "normal" }
        }
        if (
          credentials?.username === process.env.KHJ_USERNAME &&
          credentials?.password === process.env.KHJ_PASSWORD
        ) {
          return { id: "3", name: credentials.username as string, role: "khj" }
        }
        return null
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role
      return token
    },
    session({ session, token }) {
      if (session.user) (session.user as { role?: string }).role = token.role as string | undefined
      return session
    },
  },
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
})
