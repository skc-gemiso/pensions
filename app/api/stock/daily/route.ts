import { NextRequest, NextResponse } from "next/server"

export type NaverCandle = {
  date: string  // YYYY-MM-DD
  close: number
  open: number
  high: number
  low: number
  volume: number
}

// GET /api/stock/daily?code=005930&count=500
export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get("code")
  const count = req.nextUrl.searchParams.get("count") ?? "500"
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 })

  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${code}/candle/day?count=${count}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://m.stock.naver.com",
        },
        next: { revalidate: 0 },
      }
    )
    if (!res.ok) return NextResponse.json({ error: "naver fetch failed" }, { status: 502 })

    const data = await res.json()
    if (!Array.isArray(data)) return NextResponse.json({ candles: [] })

    const candles: NaverCandle[] = data.map((d: Record<string, string>) => ({
      date:   `${String(d.localDate).slice(0, 4)}-${String(d.localDate).slice(4, 6)}-${String(d.localDate).slice(6, 8)}`,
      close:  Number(String(d.closePrice ?? "0").replace(/,/g, "")),
      open:   Number(String(d.openPrice  ?? "0").replace(/,/g, "")),
      high:   Number(String(d.highPrice  ?? "0").replace(/,/g, "")),
      low:    Number(String(d.lowPrice   ?? "0").replace(/,/g, "")),
      volume: Number(String(d.accumulatedTradingVolume ?? "0").replace(/,/g, "")),
    }))

    return NextResponse.json({ candles })
  } catch {
    return NextResponse.json({ error: "internal error" }, { status: 500 })
  }
}
