import { NextRequest, NextResponse } from "next/server"

export type StockSearchItem = {
  code: string
  name: string
  market: string
}

// GET /api/stock/search?q=삼성
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim()
  if (!q) return NextResponse.json([])

  try {
    const url = `https://ac.finance.naver.com/ac?q=${encodeURIComponent(q)}&q_enc=UTF-8&st=111&r_format=json&r_count=20&r_lt=111`
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://finance.naver.com",
      },
      next: { revalidate: 0 },
    })
    if (!res.ok) return NextResponse.json([])

    const data = await res.json()
    // items[0]: 종목 결과 배열, 각 항목: [이름, 코드, 타입, 시장, ...]
    const raw: string[][] = data?.items?.[0] ?? []

    const items: StockSearchItem[] = raw
      .map((item) => ({
        name:   String(item[0] ?? ""),
        code:   String(item[1] ?? ""),
        market: String(item[3] ?? ""),
      }))
      .filter((item) => item.code && item.name)

    return NextResponse.json(items)
  } catch {
    return NextResponse.json([])
  }
}
