"use client"

import { useEffect, useState } from "react"
import AppLayout from "@/components/AppLayout"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { fmt, cc, fmtKRW } from "@/lib/fmt"
import { getTreasurySeries } from "../actions"

const PERIODS = [
  { label: "1년",  months: 12  },
  { label: "2년",  months: 24  },
  { label: "5년",  months: 60  },
  { label: "전체", months: undefined },
]

type Row = {
  stat_date: string
  country_code: string
  country_name: string
  amount_usd_billion: number
  fx_rate: number | null
  amount_krw_trillion: number | null
}

type ChartPoint = {
  date: string
  japanUsd?: number
  japanKrw?: number
  chinaUsd?: number
  chinaKrw?: number
}

type TableRow = {
  date: string
  jpnUsd: number | null; jpnKrw: number | null
  chnUsd: number | null; chnKrw: number | null
}

// amount_krw_trillion은 조 단위(÷1e12) 값 → fmtKRW에 원 단위로 환산해 전달
function krwTril(v: number | null | undefined): string {
  if (v == null) return "-"
  return fmtKRW(v * 1e12)
}
// 증감 표시 (양수일 때 + 접두사 추가)
function krwTrilDiff(v: number | null | undefined): string {
  if (v == null) return "-"
  return (v > 0 ? "+" : "") + fmtKRW(v * 1e12)
}
// USD 십억달러: KRW 조원과 동일한 크기별 자리수 + $...B 단위 포함
// ≥10십억달러 → 0자리, <10십억달러 → 1자리
function usdBil(v: number | null | undefined): string {
  if (v == null) return "-"
  return `$${fmt(v, Math.abs(v) >= 10 ? 0 : 1)}B`
}
const FIXED_FX = 1400  // 원화 참조 환산용 고정 환율 (1 USD = 1,400 KRW)

// USD 증감 표시 (+$12B / -$5B)
function usdBilDiff(v: number | null | undefined): string {
  if (v == null) return "-"
  const sign = v > 0 ? "+" : v < 0 ? "-" : ""
  const abs = Math.abs(v)
  return `${sign}$${fmt(abs, abs >= 10 ? 0 : 1)}B`
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; color: string; payload: ChartPoint }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const pt = payload[0]?.payload
  if (!pt) return null
  const entries = [
    { name: "일본", color: "#3b82f6", krw: pt.japanKrw, usd: pt.japanUsd },
    { name: "중국", color: "#ef4444", krw: pt.chinaKrw, usd: pt.chinaUsd },
  ]
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm text-xs min-w-[200px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {entries.map((e) => (
        <div key={e.name} className="flex items-center gap-2 mb-1 last:mb-0">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
          <span className="text-gray-500 w-7">{e.name}</span>
          <span className="font-bold" style={{ color: e.color }}>
            {usdBil(e.usd)}
          </span>
          {e.krw != null && (
            <span className="text-gray-500 ml-1">({krwTril(e.krw)})</span>
          )}
        </div>
      ))}
    </div>
  )
}

export default function TreasuryPage() {
  const [months, setMonths]   = useState<number | undefined>(24)
  const [unit, setUnit]       = useState<"usd" | "krw">("usd")
  const [rows, setRows]       = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getTreasurySeries(months).then((d) => { setRows(d); setLoading(false) })
  }, [months])

  // Pivot for chart
  const dateMap = new Map<string, ChartPoint>()
  for (const r of rows) {
    const d = r.stat_date.slice(0, 10)
    if (!dateMap.has(d)) dateMap.set(d, { date: d })
    const pt = dateMap.get(d)!
    if (r.country_code === "JPN") {
      pt.japanUsd = r.amount_usd_billion
      pt.japanKrw = r.amount_usd_billion * FIXED_FX / 1000
    }
    if (r.country_code === "CHN") {
      pt.chinaUsd = r.amount_usd_billion
      pt.chinaKrw = r.amount_usd_billion * FIXED_FX / 1000
    }
  }
  const chartData = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date))

  // Pivot for table
  const tableMap = new Map<string, TableRow>()
  for (const r of rows) {
    const d = r.stat_date.slice(0, 10)
    if (!tableMap.has(d)) tableMap.set(d, { date: d, jpnUsd: null, jpnKrw: null, chnUsd: null, chnKrw: null })
    const tr = tableMap.get(d)!
    if (r.country_code === "JPN") { tr.jpnUsd = r.amount_usd_billion; tr.jpnKrw = r.amount_usd_billion * FIXED_FX / 1000 }
    if (r.country_code === "CHN") { tr.chnUsd = r.amount_usd_billion; tr.chnKrw = r.amount_usd_billion * FIXED_FX / 1000 }
  }
  const tableData = Array.from(tableMap.values()).sort((a, b) => b.date.localeCompare(a.date))

  // Latest summary
  const lastJpn = rows.filter(r => r.country_code === "JPN").slice(-1)[0]
  const lastChn = rows.filter(r => r.country_code === "CHN").slice(-1)[0]

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">미국 국채 보유 현황</h1>
      <p className="text-sm text-gray-500 mb-4">일본·중국의 미국 국채 보유 추이 (TIC 데이터)</p>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
        <h3 className="font-semibold text-blue-800 mb-3">데이터 안내</h3>
        <ul className="text-sm text-blue-700 space-y-1.5">
          <li>• <span className="font-medium">자료 출처</span>: 미국 재무부 TIC(Treasury International Capital) — Major Foreign Holders of Treasury Securities 공식 집계</li>
          <li>• <span className="font-medium">발표 시차</span>: 기준월 종료 후 약 1.5개월 후 발표 (예: 4월 데이터 → 6월 중순 공개)</li>
          <li>• <span className="font-medium">예측 자료</span>: 현재(2026.05) 국가별로 더 빠르고 정확하게 제공하는 무료 공개 API 없음 — TIC가 사실상 유일한 공식 소스</li>
        </ul>
        <br></br>
        <ul className="text-sm text-red-700 space-y-1.5">
          <li># <span className="font-medium">원화 자료</span>: 원화로 환산된 금액은 단순 참고용이며 달러를 기준으로 변동을 확인하여야 함 — 환율 변동으로 착시 발생 할수 있어서 $1 = 1,400원 환율 고정함</li>
        </ul>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {[
          { label: "일본 최근 보유액", last: lastJpn, color: "text-blue-600" },
          { label: "중국 최근 보유액", last: lastChn, color: "text-red-600" },
        ].map(({ label, last, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">{label}</p>
            {last ? (
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-sm text-gray-500">{last.stat_date?.slice(0, 7)}</span>
                <span className={`text-xl font-bold ${color}`}>
                  {usdBil(last.amount_usd_billion)}
                </span>
                <span className="text-sm text-gray-500">
                  ({krwTril(last.amount_usd_billion * FIXED_FX / 1000)})
                </span>
              </div>
            ) : (
              <p className="text-gray-500">-</p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.label}
              onClick={() => setMonths(p.months)}
              className={`px-3 py-2 text-sm rounded-lg border font-medium transition-colors ${
                months === p.months
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setUnit(unit === "usd" ? "krw" : "usd")}
          className={`px-4 py-2 text-sm rounded-lg border font-medium transition-colors ${
            unit === "krw"
              ? "bg-blue-600 text-white border-blue-600"
              : "border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
          }`}
        >
          차트: {unit === "usd" ? "USD" : "KRW"}
        </button>
      </div>

      {loading && <p className="text-center text-gray-400 py-8">로딩 중...</p>}

      {!loading && chartData.length > 0 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: "#374151" }}
                  tickFormatter={(v) => v.slice(0, 7)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#374151" }}
                  tickFormatter={(v) => Number(v).toLocaleString()}
                  width={80}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey={unit === "usd" ? "japanUsd" : "japanKrw"}
                  stroke="#3b82f6" dot={false} strokeWidth={2} name="일본" connectNulls
                />
                <Line
                  type="monotone"
                  dataKey={unit === "usd" ? "chinaUsd" : "chinaKrw"}
                  stroke="#ef4444" dot={false} strokeWidth={2} name="중국" connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700" rowSpan={2}>날짜</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-blue-700 border-l border-gray-200" colSpan={6}>일본</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-red-700 border-l border-gray-200" colSpan={6}>중국</th>
                  </tr>
                  <tr>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border-l border-gray-200">금액(달러)</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">증감(달러)</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">증감률(달러)</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">금액(원)</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">증감(원)</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">증감률(원)</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border-l border-gray-200">금액(달러)</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">증감(달러)</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">증감률(달러)</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">금액(원)</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">증감(원)</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">증감률(원)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tableData.map((r, i) => {
                    const prev = tableData[i + 1]
                    const jpnKrwDiff = r.jpnKrw != null && prev?.jpnKrw != null ? r.jpnKrw - prev.jpnKrw : null
                    const jpnKrwRate = jpnKrwDiff != null && prev?.jpnKrw ? jpnKrwDiff / prev.jpnKrw * 100 : null
                    const jpnUsdDiff = r.jpnUsd != null && prev?.jpnUsd != null ? r.jpnUsd - prev.jpnUsd : null
                    const jpnUsdRate = jpnUsdDiff != null && prev?.jpnUsd ? jpnUsdDiff / prev.jpnUsd * 100 : null
                    const chnKrwDiff = r.chnKrw != null && prev?.chnKrw != null ? r.chnKrw - prev.chnKrw : null
                    const chnKrwRate = chnKrwDiff != null && prev?.chnKrw ? chnKrwDiff / prev.chnKrw * 100 : null
                    const chnUsdDiff = r.chnUsd != null && prev?.chnUsd != null ? r.chnUsd - prev.chnUsd : null
                    const chnUsdRate = chnUsdDiff != null && prev?.chnUsd ? chnUsdDiff / prev.chnUsd * 100 : null
                    return (
                      <tr key={r.date} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{r.date}</td>
                        <td className="px-3 py-2 text-sm text-right text-blue-700 font-medium border-l border-gray-100">{usdBil(r.jpnUsd)}</td>
                        <td className={`px-3 py-2 text-sm text-right font-medium ${cc(jpnUsdDiff)}`}>{usdBilDiff(jpnUsdDiff)}</td>
                        <td className={`px-3 py-2 text-sm text-right font-medium ${cc(jpnUsdRate)}`}>{jpnUsdRate == null ? "-" : (jpnUsdRate > 0 ? "+" : "") + fmt(jpnUsdRate, 1) + "%"}</td>
                        <td className="px-3 py-2 text-sm text-right text-blue-500">{krwTril(r.jpnKrw)}</td>
                        <td className={`px-3 py-2 text-sm text-right font-medium ${cc(jpnKrwDiff)}`}>{krwTrilDiff(jpnKrwDiff)}</td>
                        <td className={`px-3 py-2 text-sm text-right font-medium ${cc(jpnKrwRate)}`}>{jpnKrwRate == null ? "-" : (jpnKrwRate > 0 ? "+" : "") + fmt(jpnKrwRate, 1) + "%"}</td>
                        <td className="px-3 py-2 text-sm text-right text-red-700 font-medium border-l border-gray-100">{usdBil(r.chnUsd)}</td>
                        <td className={`px-3 py-2 text-sm text-right font-medium ${cc(chnUsdDiff)}`}>{usdBilDiff(chnUsdDiff)}</td>
                        <td className={`px-3 py-2 text-sm text-right font-medium ${cc(chnUsdRate)}`}>{chnUsdRate == null ? "-" : (chnUsdRate > 0 ? "+" : "") + fmt(chnUsdRate, 1) + "%"}</td>
                        <td className="px-3 py-2 text-sm text-right text-red-500">{krwTril(r.chnKrw)}</td>
                        <td className={`px-3 py-2 text-sm text-right font-medium ${cc(chnKrwDiff)}`}>{krwTrilDiff(chnKrwDiff)}</td>
                        <td className={`px-3 py-2 text-sm text-right font-medium ${cc(chnKrwRate)}`}>{chnKrwRate == null ? "-" : (chnKrwRate > 0 ? "+" : "") + fmt(chnKrwRate, 1) + "%"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      </div>
    </AppLayout>
  )
}
