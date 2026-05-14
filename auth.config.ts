import type { NextAuthConfig } from "next-auth"

export const authConfig = {
  pages: { signIn: "/login" },
  secret: process.env.AUTH_SECRET,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as Record<string, unknown>
        token.role    = u.role    as string | undefined
        token.loginAt = u.loginAt as string | undefined
        token.menus   = u.menus
      }
      return token
    },
    session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          name:    token.name    as string | undefined,
          role:    token.role    as string | undefined,
          loginAt: token.loginAt as string | undefined,
          menus:   token.menus,
        },
      }
    },
  },
} satisfies NextAuthConfig
