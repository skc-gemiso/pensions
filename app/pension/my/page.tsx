"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import AppLayout from "@/components/AppLayout"
import HelpModal, { H, Box, ColTable } from "@/components/HelpModal"
import { fmt, fmtKRW } from "@/lib/fmt"
import {
  getPensionOverview,
  type PensionOverview, type PensionKind, type PayoutStage,
} from "./actions"

const TONE: Record<PensionKind, {
  text: string; dot: string; bar: string; ring: string
  cardBg: string; cardBorder: string; iconBg: string; track: string
}> = {
  per: {
    text: "text-purple-700", dot: "bg-purple-500", bar: "bg-purple-500", ring: "ring-purple-100",
    cardBg: "bg-purple-50", cardBorder: "border-purple-200",
    iconBg: "bg-gradient-to-br from-purple-500 to-purple-700", track: "bg-purple-100",
  },
  ret: {
    text: "text-emerald-700", dot: "bg-emerald-500", bar: "bg-emerald-500", ring: "ring-emerald-100",
    cardBg: "bg-emerald-50", cardBorder: "border-emerald-200",
    iconBg: "bg-gradient-to-br from-emerald-500 to-emerald-700", track: "bg-emerald-100",
  },
  nat: {
    text: "text-blue-700", dot: "bg-blue-500", bar: "bg-blue-500", ring: "ring-blue-100",
    cardBg: "bg-blue-50", cardBorder: "border-blue-200",
    iconBg: "bg-gradient-to-br from-blue-500 to-blue-700", track: "bg-blue-100",
  },
}

const CARD = "bg-white border border-gray-200 rounded-2xl"

function fmtYm(ym: string): string {
  const [y, m] = ym.split("-")
  return `${y}년 ${Number(m)}월`
}

/** "578만원" → { num: "578", unit: "만원" } — 단위만 작게 쓰려고 나눈다 */
function splitKRW(n: number): { num: string; unit: string } {
  const s = fmtKRW(n)
  const m = s.match(/^(-?[\d,.]+)(.*)$/)
  return m ? { num: m[1], unit: m[2] } : { num: s, unit: "" }
}

function PensionIcon({ kind, className = "w-5 h-5" }: { kind: PensionKind; className?: string }) {
  if (kind === "per") return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <circle cx="12" cy="7.5" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0z" />
    </svg>
  )
  if (kind === "ret") return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M9 4h6a2 2 0 0 1 2 2v1h2.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-9A1.5 1.5 0 0 1 4.5 7H7V6a2 2 0 0 1 2-2m0 3h6V6H9z" />
    </svg>
  )
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 3 2.5 8v2h19V8zM5 11v7H3v2h18v-2h-2v-7h-2v7h-3v-7h-2v7H8v-7z" />
    </svg>
  )
}

// ─────────────────────────────────────────────
function PageHelp({ ov }: { ov: PensionOverview }) {
  const per = ov.pensions.find(p => p.kind === "per")!
  const ret = ov.pensions.find(p => p.kind === "ret")!
  const nat = ov.pensions.find(p => p.kind === "nat")!

  return (
    <HelpModal
      variant="page"
      title="연금 통합 현황 안내"
      lead="세 연금을 한 기준으로 모으면 어떤 그림인지"
      tabs={[
        { key: "basis", label: "무엇을 모았나", body: (
          <>
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl px-5 py-4 text-white">
              <p className="font-bold text-base mb-1">세 연금의 &ldquo;월 수령액&rdquo;을 같은 축에 놓았습니다</p>
              <p className="text-sm text-indigo-100">
                개시 시점이 서로 달라서, 나이 구간별로 얼마가 들어오는지를 봐야 실제 노후 소득이 보입니다.
              </p>
            </div>

            <Box>
              <H>각 값의 출처</H>
              <ColTable rows={[
                ["국민연금", <>공단이 통보한 <b>예상 수령액(세후)</b>. 국민연금 화면의 최신 스냅샷을 그대로 씁니다 — <b>유일한 실적 기반</b> 값입니다</>],
                ["퇴직연금", <>정년 퇴직금(실수령)을 커버드콜로 굴려 {per.startAge}세부터 받는 분배금. 회사 사전 계산값 기준</>],
                ["개인연금", <>연금저축펀드 현재 보유수량 + 월 적립 + 분배금 재투자. 실제 매수 내역이 반영됩니다</>],
              ]} />
            </Box>

            <Box tone="amber">
              <H>개시 시점이 둘로 갈립니다</H>
              <div className="space-y-1.5 text-xs text-gray-700">
                <p><b className="text-purple-700">{per.startAge}세</b> — 개인연금·퇴직연금이 함께 시작합니다 (같은 수령 나이 설정)</p>
                <p><b className="text-blue-700">{nat.startAge}세</b> — 국민연금이 더해집니다 (1969년 이후 출생자 기준)</p>
                <p className="text-gray-500 pt-1">
                  정년({fmtYm(ov.retireDate.slice(0, 7))}) 이후 {per.startAge}세까지는 세 연금 모두 수령액이 없습니다.
                  그 기간의 생활비는 이 화면에 없습니다.
                </p>
              </div>
            </Box>
          </>
        ) },
        { key: "assume", label: "공통 전제", body: (
          <>
            <Box>
              <H>퇴직연금·개인연금이 같은 전제를 씁니다</H>
              <ColTable rows={[
                ["분배율", <>KODEX 200 타겟위클리커버드콜 최근 12회 평균 — 연 <b>{(ov.ccAnnualRate * 100).toFixed(1)}%</b></>],
                ["주가", <>현재가 고정(상승률 0%). 커버드콜은 주가 상승을 포기하고 분배금을 받는 구조라 이 편이 실제에 가깝습니다</>],
                ["수령 방식", <>원금(수량)을 헐지 않고 <b>분배금만</b> 받습니다. 그래서 수령액이 줄지 않습니다</>],
                ["세금", <>반영하지 않았습니다. 커버드콜 분배금은 과세 대상이 분배금의 4~5%뿐이라 실효세율이 1% 미만입니다</>],
              ]} />
            </Box>

            <Box tone="blue">
              <H>국민연금만 성격이 다릅니다</H>
              <p className="text-xs text-gray-700 leading-relaxed">
                국민연금은 물가에 연동돼 매년 오르고 사망할 때까지 나옵니다.
                반면 퇴직·개인연금은 <b>분배율이 유지된다는 가정</b> 위에 서 있고 물가 연동이 없습니다.
                금액은 국민연금이 가장 작지만, <b>확실성은 가장 높습니다.</b>
              </p>
            </Box>
          </>
        ) },
        { key: "limit", label: "⚠️ 한계", body: (
          <Box tone="amber">
            <H>⚠️ 이 합계를 그대로 믿으면 안 되는 이유</H>
            <ul className="text-xs text-gray-700 space-y-2 list-disc pl-4 leading-relaxed">
              <li><b>물가를 반영하지 않았습니다.</b> {per.startAge}세의 {fmtKRW(ov.peakMonthly)}은 지금의 같은 금액과 가치가 다릅니다.</li>
              <li><b>분배율 가정에 크게 기댑니다.</b> 합계의 {Math.round((per.monthly + ret.monthly) / ov.peakMonthly * 100)}%가
                커버드콜 분배금이라, 연 {(ov.ccAnnualRate * 100).toFixed(1)}%가 흔들리면 합계도 같이 흔들립니다.</li>
              <li><b>주가 하락이 반영돼 있지 않습니다.</b> 평가액이 줄면 분배금도 함께 줍니다.</li>
              <li><b>정년 이후 {per.startAge}세까지의 공백</b>은 다루지 않습니다.</li>
              <li><b>건강보험료·세금</b>은 계산에 없습니다.</li>
            </ul>
          </Box>
        ) },
      ]}
    />
  )
}

// ─────────────────────────────────────────────
function StageBar({ stage, max }: { stage: PayoutStage; max: number }) {
  const parts = ([
    { kind: "per", value: stage.per },
    { kind: "ret", value: stage.ret },
    { kind: "nat", value: stage.nat },
  ] as { kind: PensionKind; value: number }[]).filter(p => p.value > 0)

  return (
    <div className="flex h-9 rounded-lg overflow-hidden bg-gray-200/70"
      style={{ width: `${(stage.total / max) * 100}%` }}>
      {parts.map(p => {
        const v = splitKRW(p.value)
        return (
          <div key={p.kind} className={`${TONE[p.kind].bar} flex items-center justify-center`}
            style={{ width: `${(p.value / stage.total) * 100}%` }}>
            {p.value / stage.total > 0.12 && (
              <span className="text-xs font-semibold text-white px-1 truncate">
                {v.num}<span className="text-[10px] font-medium">{v.unit}</span>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────
export default function DashboardPage() {
  const [ov, setOv] = useState<PensionOverview | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setOv(await getPensionOverview()) } catch { /* 권한 없음 */ }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const first = ov?.stages[0]
  const last = ov?.stages[ov.stages.length - 1]
  const maxTotal = ov ? Math.max(...ov.stages.map(s => s.total), 1) : 1

  return (
    <AppLayout>
      {/* main 의 하단 여백을 상쇄해 화면 아래 공백을 줄인다 */}
      <div className="max-w-7xl mx-auto space-y-4 -mb-4 md:-mb-6">

        {/* 헤더 */}
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">나의 연금 현황</h1>
              {ov && <PageHelp ov={ov} />}
            </div>
            <p className="text-gray-500 text-sm mt-1">
              국민연금 · 퇴직연금 · 개인연금을 한 기준으로 합산한 예상 수령액
            </p>
          </div>
          {ov && (
            <p className="text-xs text-gray-400 self-end flex items-center gap-2">
              현재 만 {ov.currentAge}세
              <span className="text-gray-300">|</span>
              {fmtYm(ov.today)} 기준
            </p>
          )}
        </div>

        {loading && <p className="text-sm text-gray-400 py-10 text-center">불러오는 중…</p>}

        {ov && first && last && (
          <>
            {/* ── 요약 + 수령 시점별 (한 카드) ── */}
            <div className={`${CARD} overflow-hidden`}>

              {/* 상단 — 합산 요약 */}
              <div className="px-6 py-8 flex items-center gap-6 flex-wrap">
                <div className="flex-shrink-0 pr-6">
                  <p className="text-gray-500 text-base">
                    만 {last.fromAge}세 ~ {fmtYm(last.fromYm)}부터 연금 수령 예상
                  </p>
                  <p className="text-gray-900 text-[52px] font-bold tabular-nums leading-tight mt-1">
                    {fmt(last.total)}
                    <span className="text-lg font-medium text-gray-500 ml-1">원 / 월</span>
                  </p>
                  <p className="text-gray-500 text-base mt-1">연 {fmtKRW(last.total * 12)}</p>
                </div>

                {ov.pensions.map(p => {
                  const t = TONE[p.kind]
                  const v = splitKRW(p.monthly)
                  return (
                    <div key={p.kind} className="flex items-center gap-3 px-6 border-l border-gray-100">
                      <span className={`flex items-center justify-center w-12 h-12 rounded-full text-white flex-shrink-0
                                        ${t.iconBg} ring-4 ${t.ring}`}>
                        <PensionIcon kind={p.kind} className="w-6 h-6" />
                      </span>
                      <div>
                        <p className="text-gray-600 text-sm">{p.label}</p>
                        <p className="text-gray-900 text-2xl font-bold tabular-nums leading-tight">
                          {v.num}<span className="text-sm font-medium ml-0.5">{v.unit}</span>
                        </p>
                        <p className={`text-xs font-medium ${t.text}`}>
                          {Math.round(p.monthly / last.total * 100)}%
                        </p>
                      </div>
                    </div>
                  )
                })}

                <div className="ml-auto rounded-xl border border-gray-200 bg-gray-50 px-5 py-3">
                  <p className="text-gray-500 text-xs">
                    먼저 받는 시점 · 만 {first.fromAge}세
                  </p>
                  <p className="text-gray-900 text-xl font-bold tabular-nums leading-tight mt-1">
                    월 {fmtKRW(first.total)}
                  </p>
                  <p className="text-gray-400 text-xs mt-1.5 flex items-center gap-1.5">
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="5" width="18" height="16" rx="2" />
                      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
                    </svg>
                    {fmtYm(first.fromYm)}
                  </p>
                </div>
              </div>

              {/* 하단 — 수령 시점별 */}
              <div className="px-6 py-5 border-t border-gray-100 bg-gray-50/60">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                  <h2 className="text-gray-900 font-semibold text-base">수령 시점별 연금 수령액</h2>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {ov.pensions.map(p => (
                      <span key={p.kind} className="flex items-center gap-1.5">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${TONE[p.kind].dot}`} />
                        {p.label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  {ov.stages.map((stage, i) => {
                    const st = splitKRW(stage.total)
                    return (
                      <div key={stage.fromYm}
                        className={`flex items-center gap-4 flex-wrap ${i > 0 ? "border-t border-gray-200/70 pt-3" : ""}`}>
                        <span className="text-gray-900 font-semibold w-28 flex-shrink-0">
                          만 {stage.fromAge}세부터
                        </span>
                        <span className="text-gray-400 text-sm w-24 flex-shrink-0">{fmtYm(stage.fromYm)}</span>

                        <span className="flex gap-2 flex-shrink-0">
                          {stage.starting.map(k => {
                            const t = TONE[k]
                            return (
                              <span key={k}
                                className={`text-xs font-medium px-2.5 py-1 rounded-full border ${t.cardBorder} bg-white ${t.text}`}>
                                + {ov.pensions.find(p => p.kind === k)?.label} 시작
                              </span>
                            )
                          })}
                        </span>

                        <div className="flex-1 min-w-[240px]">
                          <StageBar stage={stage} max={maxTotal} />
                        </div>

                        <span className="text-gray-900 text-lg font-bold tabular-nums flex-shrink-0 w-32 text-right">
                          월 {st.num}<span className="text-sm font-medium ml-0.5">{st.unit}</span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* ── 연금별 카드 ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {ov.pensions.map(p => {
                const t = TONE[p.kind]
                return (
                  <Link key={p.kind} href={p.href}
                    className={`block rounded-2xl border ${t.cardBorder} ${t.cardBg} px-5 py-5
                                hover:shadow-md transition-shadow`}>
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`flex items-center justify-center w-11 h-11 rounded-full text-white flex-shrink-0
                                        ${t.iconBg} ring-4 ${t.ring}`}>
                        <PensionIcon kind={p.kind} className="w-5 h-5" />
                      </span>
                      <div>
                        <h3 className={`font-bold text-lg ${t.text}`}>{p.label}</h3>
                        <p className="text-gray-500 text-xs">월 수령액 ({p.startAge}세~)</p>
                      </div>
                    </div>

                    <p className={`text-3xl font-bold tabular-nums leading-tight ${t.text}`}>
                      {fmt(p.monthly)}<span className="text-sm font-medium text-gray-500 ml-1">원</span>
                    </p>
                    <p className="text-gray-500 text-xs mt-1">{p.basis}</p>

                    <div className="mt-4 pt-4 border-t border-gray-200/70 space-y-2.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-gray-500">{p.accumulatedLabel}</span>
                        <span className="text-sm font-semibold text-gray-800 tabular-nums">
                          {fmtKRW(p.accumulated)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 flex-shrink-0">{p.progressLabel}</span>
                        <div className={`flex-1 rounded-full h-1.5 ${t.track}`}>
                          <div className={`${t.bar} h-1.5 rounded-full`} style={{ width: `${p.progressPct}%` }} />
                        </div>
                        <span className={`text-xs font-semibold ${t.text} flex-shrink-0`}>{p.progressPct}%</span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
