"use client"

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { fmt, fmtKRW } from "@/lib/fmt"

export type ChartPoint = {
  date: string
  price: number
  price_krw: number
  market_currency: string
  weight: number
  shares: number
  nation_value: number
}

const TT = {
  contentStyle: { fontSize: 12, padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6 },
  labelStyle:   { fontSize: 11, fontWeight: 600 as const, color: "#374151", marginBottom: 2 },
  itemStyle:    { fontSize: 12, padding: "1px 0" },
}

function normalize(arr: number[]): number[] {
  const min = Math.min(...arr)
  const max = Math.max(...arr)
  if (max === min) return arr.map(() => 50)
  return arr.map((v) => ((v - min) / (max - min)) * 100)
}

type NormPoint = ChartPoint & { norm_price: number; norm_weight: number; norm_shares: number; norm_value: number }

function CombinedTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: ChartPoint }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ fontSize: 12, padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff" }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6 }}>{label}</p>
      <p style={{ color: "#2563eb", margin: "2px 0" }}>주가: {fmt(d.price_krw, 0)} 원</p>
      <p style={{ color: "#16a34a", margin: "2px 0" }}>비중: {fmt(d.weight, 2)}%</p>
      <p style={{ color: "#f97316", margin: "2px 0" }}>보유 수량: {fmt(d.shares, 0)}</p>
      <p style={{ color: "#7c3aed", margin: "2px 0" }}>보유 금액: {fmtKRW(d.nation_value)}</p>
    </div>
  )
}

export function StockSeriesPanel({ data }: { data: ChartPoint[] }) {
  if (data.length === 0) return null

  const nPrice  = normalize(data.map((d) => d.price_krw))
  const nWeight = normalize(data.map((d) => d.weight))
  const nShares = normalize(data.map((d) => d.shares))
  const nValue  = normalize(data.map((d) => d.nation_value))
  const normData: NormPoint[] = data.map((d, i) => ({
    ...d,
    norm_price:   nPrice[i],
    norm_weight:  nWeight[i],
    norm_shares:  nShares[i],
    norm_value:   nValue[i],
  }))

  const rev = [...data].reverse()
  const cc  = (v: number | null) => v == null ? "text-gray-400" : v > 0 ? "text-red-600" : v < 0 ? "text-blue-600" : "text-gray-400"

  return (
    <>
      {/* 주가 추이 + 비중(%) 추이 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">주가 추이</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#374151" }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: "#374151" }} domain={["auto", "auto"]} />
              <Tooltip formatter={(v: unknown) => fmt(v as number, 0)} labelFormatter={(l) => String(l)} {...TT} />
              <Line type="monotone" dataKey="price_krw" stroke="#2563eb" dot={false} strokeWidth={2} name="주가(KRW)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">비중(%) 추이</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#374151" }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: "#374151" }} domain={["auto", "auto"]} />
              <Tooltip formatter={(v: unknown) => `${fmt(v as number, 1)}%`} labelFormatter={(l) => String(l)} {...TT} />
              <Line type="monotone" dataKey="weight" stroke="#16a34a" dot={false} strokeWidth={2} name="비중" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 종목 추세 (4개 지표 정규화) */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">종목 추세</h3>
        <p className="text-xs text-gray-400 mb-3">4개 지표를 0~100으로 정규화하여 비교 (실제 값은 툴팁 참조)</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600 mb-3">
          {([
            { label: "주가",      color: "#2563eb" },
            { label: "비중(%)",   color: "#16a34a" },
            { label: "보유 수량", color: "#f97316" },
            { label: "보유 금액", color: "#7c3aed" },
          ] as const).map(({ label, color }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span style={{ background: color }} className="inline-block w-4 h-0.5 rounded" />
              {label}
            </span>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={normData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#374151" }} tickFormatter={(v) => v.slice(5)} />
            <YAxis tick={{ fontSize: 10, fill: "#374151" }} domain={[0, 100]} tickFormatter={(v) => `${Math.round(v)}`} />
            <Tooltip content={<CombinedTooltip />} />
            <Line type="monotone" dataKey="norm_price"  stroke="#2563eb" dot={false} strokeWidth={2} name="주가" />
            <Line type="monotone" dataKey="norm_weight" stroke="#16a34a" dot={false} strokeWidth={2} name="비중(%)" />
            <Line type="monotone" dataKey="norm_shares" stroke="#f97316" dot={false} strokeWidth={2} name="보유 수량" />
            <Line type="monotone" dataKey="norm_value"  stroke="#7c3aed" dot={false} strokeWidth={2} name="보유 금액" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 날짜별 상세 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["날짜", "주가", "주가 증감", "보유 비중", "비중 증감률", "보유수량", "수량 증감", "총 보유 금액", "보유 금액 증감"].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-700 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rev.map((row, i) => {
                const prev       = rev[i + 1]
                const priceDiff  = prev ? row.price_krw - prev.price_krw : null
                const pctChg     = prev && prev.price_krw > 0 ? ((row.price_krw - prev.price_krw) / prev.price_krw) * 100 : null
                const sharesDiff = prev ? row.shares - prev.shares : null
                const nationDiff = prev ? row.nation_value - prev.nation_value : null
                const isKrw      = row.market_currency === "KRW"
                const priceDisplay = isKrw ? fmt(row.price_krw, 0) : `${fmt(row.price_krw, 0)} (USD ${fmt(row.price, 4)})`
                return (
                  <tr key={row.date} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-left text-gray-700">{row.date}</td>
                    <td className="px-4 py-2.5 text-right text-gray-900 font-medium">{priceDisplay}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${cc(priceDiff)}`}>
                      {priceDiff != null ? `${priceDiff > 0 ? "+" : ""}${fmt(priceDiff, 0)}` : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-900 font-medium">{fmt(row.weight, 1)}%</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${cc(pctChg)}`}>
                      {pctChg != null ? `${pctChg > 0 ? "+" : ""}${fmt(pctChg, 1)}%` : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-900 font-medium">{fmt(row.shares, 0)}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${cc(sharesDiff)}`}>
                      {sharesDiff != null ? `${sharesDiff > 0 ? "+" : ""}${fmt(sharesDiff, 0)}` : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-900 font-medium">{fmtKRW(row.nation_value)}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${cc(nationDiff)}`}>
                      {nationDiff != null ? `${nationDiff > 0 ? "+" : ""}${fmtKRW(nationDiff)}` : "-"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
