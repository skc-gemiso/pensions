import type { Metadata } from "next"
import { Geist } from "next/font/google"
import Providers from "@/components/Providers"
import { auth } from "@/auth"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })

export const metadata: Metadata = {
  title: "연금 관리",
  description: "나의 연금 현황을 한눈에 관리하세요",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <html lang="ko" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  )
}
