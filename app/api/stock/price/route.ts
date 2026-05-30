import { NextRequest, NextResponse } from "next/server"

export type NaverPrice = {
  price: number
  change: number
  changeRate: number
  name: string
  volume: number
}

// GET /api/stock/price?codes=005930,069500
export async function GET(req: NextRequest) {
  const codes = req.nextUrl.searchParams.get("codes")
  if (!codes) return NextResponse.json({}, { status: 400 })

  const codeList = codes.split(",").map((c) => c.trim()).filter(Boolean)
  if (codeList.length === 0) return NextResponse.json({})

  const result: Record<string, NaverPrice> = {}

  await Promise.all(
    codeList.map(async (code) => {
      try {
        const res = await fetch(
          `https://m.stock.naver.com/api/stock/${code}/basic`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Referer": "https://m.stock.naver.com",
            },
            next: { revalidate: 0 },
          }
        )
        if (!res.ok) return
        const data = await res.json()

        const price      = Number(String(data.closePrice ?? "0").replace(/,/g, ""))
        const change     = Number(String(data.compareToPreviousClosePrice ?? "0").replace(/[+,]/g, ""))
        const changeRate = Number(String(data.fluctuationsRatio ?? "0").replace(/[+,]/g, ""))
        const volume     = Number(String(data.accumulatedTradingVolume ?? "0").replace(/,/g, ""))
        const name       = String(data.stockName ?? code)

        result[code] = { price, change, changeRate, name, volume }
      } catch {
        // ignore individual failures
      }
    })
  )

  return NextResponse.json(result)
}
