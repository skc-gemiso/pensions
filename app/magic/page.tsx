"use client"

import AppLayout from "@/components/AppLayout"
import { useState, useMemo } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

function formatKRW(value: number) {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`
  if (value >= 10_000) return `${(value / 10_000).toFixed(0)}만`
  return `${value.toLocaleString()}`
}

export default function CompoundMagicPage() {
  const [initialAmount, setInitialAmount] = useState(10_000_000)
  const [monthlyContrib, setMonthlyContrib] = useState(300_000)
  const [annualRate, setAnnualRate] = useState(7)
  const [years, setYears] = useState(30)

  const chartData = useMemo(() => {
    const data = []
    let balance = initialAmount
    const monthlyRate = annualRate / 100 / 12
    let totalContrib = initialAmount

    for (let y = 0; y <= years; y++) {
      data.push({
        year: `${y}년`,
        balance: Math.round(balance),
        totalContrib: Math.round(totalContrib),
      })
      if (y < years) {
        for (let m = 0; m < 12; m++) {
          balance = balance * (1 + monthlyRate) + monthlyContrib
          totalContrib += monthlyContrib
        }
      }
    }
    return data
  }, [initialAmount, monthlyContrib, annualRate, years])

  const finalBalance = chartData[chartData.length - 1]?.balance ?? 0
  const finalContrib = chartData[chartData.length - 1]?.totalContrib ?? 0
  const totalReturn = finalBalance - finalContrib

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">복리의 마법</h1>
          <p className="text-gray-500 text-sm">장기 복리 투자 시뮬레이션</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-4 text-sm">시뮬레이션 설정</h2>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">초기 투자금</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={initialAmount}
                      onChange={(e) => setInitialAmount(Number(e.target.value))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      step={1_000_000}
                    />
                    <span className="text-xs text-gray-400 whitespace-nowrap">원</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-1">월 납입액</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={monthlyContrib}
                      onChange={(e) => setMonthlyContrib(Number(e.target.value))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      step={100_000}
                    />
                    <span className="text-xs text-gray-400 whitespace-nowrap">원</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-1">연 수익률</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={annualRate}
                      onChange={(e) => setAnnualRate(Number(e.target.value))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      step={0.5}
                      min={0}
                      max={30}
                    />
                    <span className="text-xs text-gray-400 whitespace-nowrap">%</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-1">투자 기간</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={years}
                      onChange={(e) => setYears(Number(e.target.value))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      step={1}
                      min={1}
                      max={50}
                    />
                    <span className="text-xs text-gray-400 whitespace-nowrap">년</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 space-y-3">
              <div>
                <p className="text-xs text-gray-500">최종 평가액</p>
                <p className="text-2xl font-bold text-blue-700">{formatKRW(finalBalance)}원</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">총 납입액</p>
                <p className="text-lg font-semibold text-gray-700">{formatKRW(finalContrib)}원</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">수익 (복리 효과)</p>
                <p className="text-lg font-semibold text-green-600">{formatKRW(totalReturn)}원</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-4 text-sm">자산 성장 추이</h2>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 11 }}
                  interval={Math.floor(years / 5)}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatKRW(v)}
                />
                <Tooltip
                  formatter={(value, name) => [
                    `${Number(value).toLocaleString()}원`,
                    name === "balance" ? "평가액" : "납입액",
                  ]}
                />
                <Legend
                  formatter={(value) => (value === "balance" ? "평가액" : "납입액")}
                />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="totalContrib"
                  stroke="#d1d5db"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
