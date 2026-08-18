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
  text: string; bg: string; border: string; bar: string; soft: string; icon: string
}> = {
  per: { text: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200", bar: "bg-purple-500", soft: "bg-purple-100", icon: "💼" },
  ret: { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", bar: "bg-emerald-500", soft: "bg-emerald-100", icon: "🏢" },
  nat: { text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", bar: "bg-blue-500", soft: "bg-blue-100", icon: "🏛️" },
}

function fmtYm(ym: string): string {
  const [y, m] = ym.split("-")
  return `${y}년 ${Number(m)}월`
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
    <div className="flex h-7 rounded-lg overflow-hidden bg-gray-100" style={{ width: `${(stage.total / max) * 100}%` }}>
      {parts.map(p => (
        <div key={p.kind} className={`${TONE[p.kind].bar} flex items-center justify-center`}
          style={{ width: `${(p.value / stage.total) * 100}%` }}
          title={`${p.kind}: ${fmtKRW(p.value)}`}>
          {p.value / stage.total > 0.15 && (
            <span className="text-[10px] font-medium text-white px-1 truncate">{fmtKRW(p.value)}</span>
          )}
        </div>
      ))}
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
      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">

        {/* 헤더 */}
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">나의 연금 현황</h1>
              {ov && <PageHelp ov={ov} />}
            </div>
            <p className="text-gray-500 text-sm">
              국민연금 · 퇴직연금 · 개인연금을 한 기준으로 합산한 노후 월 소득
            </p>
          </div>
          {ov && (
            <p className="text-xs text-gray-400 self-end">
              현재 만 {ov.currentAge}세 · {fmtYm(ov.today)} 기준
            </p>
          )}
        </div>

        {loading && <p className="text-sm text-gray-400 py-10 text-center">불러오는 중…</p>}

        {ov && first && last && (
          <>
            {/* ── 핵심 요약 ── 한 줄로 압축 */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl px-6 py-5 text-white
                            flex items-center gap-6 flex-wrap">
              <div className="flex-shrink-0">
                <p className="text-indigo-100 text-xs mb-0.5">
                  {last.fromAge}세({fmtYm(last.fromYm)})부터 · 세 연금 전부
                </p>
                <p className="text-3xl font-bold tabular-nums leading-tight">
                  월 {fmtKRW(last.total)}
                </p>
                <p className="text-indigo-100 text-xs mt-0.5">연 {fmtKRW(last.total * 12)}</p>
              </div>

              <div className="flex gap-5 flex-wrap border-l border-white/20 pl-6">
                {ov.pensions.map(p => (
                  <div key={p.kind}>
                    <p className="text-[11px] text-indigo-200">{p.label}</p>
                    <p className="text-lg font-bold tabular-nums leading-tight">{fmtKRW(p.monthly)}</p>
                    <p className="text-[11px] text-indigo-200">{Math.round(p.monthly / last.total * 100)}%</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-5 flex-wrap border-l border-white/20 pl-6 ml-auto">
                <div>
                  <p className="text-[11px] text-indigo-200">먼저 받는 시점</p>
                  <p className="text-base font-bold leading-tight">{first.fromAge}세 {fmtYm(first.fromYm)}</p>
                  <p className="text-[11px] text-indigo-200 tabular-nums">월 {fmtKRW(first.total)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-indigo-200">지금까지 쌓은 금액</p>
                  <p className="text-base font-bold tabular-nums leading-tight">
                    {fmtKRW(ov.pensions.reduce((s, p) => s + p.accumulated, 0))}
                  </p>
                  <p className="text-[11px] text-indigo-200">납부액 + 퇴직금 + 평가액</p>
                </div>
              </div>
            </div>

            {/* ── 수령 타임라인 ── */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-2.5 border-b border-gray-100 flex items-baseline gap-2 flex-wrap">
                <h2 className="font-semibold text-gray-900 text-sm">수령 시점별 월 소득</h2>
                <p className="text-xs text-gray-400">개시 나이가 달라 구간마다 합계가 달라집니다</p>
              </div>
              <div className="px-5 py-4 space-y-3.5">
                {ov.stages.map(stage => (
                  <div key={stage.fromYm}>
                    <div className="flex items-baseline justify-between mb-1 flex-wrap gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">
                          만 {stage.fromAge}세부터
                        </span>
                        <span className="text-xs text-gray-400">{fmtYm(stage.fromYm)}</span>
                        {stage.starting.map(k => (
                          <span key={k} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${TONE[k].soft} ${TONE[k].text}`}>
                            + {ov.pensions.find(p => p.kind === k)?.label} 시작
                          </span>
                        ))}
                      </div>
                      <span className="text-sm font-bold text-gray-900 tabular-nums">
                        월 {fmtKRW(stage.total)}
                      </span>
                    </div>
                    <StageBar stage={stage} max={maxTotal} />
                  </div>
                ))}

                <div className="flex items-center gap-4 pt-0.5 text-[11px] text-gray-500">
                  {ov.pensions.map(p => (
                    <span key={p.kind} className="flex items-center gap-1.5">
                      <span className={`inline-block w-2.5 h-2.5 rounded-sm ${TONE[p.kind].bar}`} />
                      {p.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* ── 연금별 카드 ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {ov.pensions.map(p => {
                const t = TONE[p.kind]
                return (
                  <Link key={p.kind} href={p.href}
                    className={`block rounded-xl border ${t.border} ${t.bg} p-5 hover:shadow-md transition-shadow`}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-xl">{t.icon}</span>
                      <h3 className={`font-bold ${t.text}`}>{p.label}</h3>
                      <svg className={`w-4 h-4 ml-auto ${t.text} opacity-50`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>

                    <p className="text-xs text-gray-500">월 수령액 ({p.startAge}세~)</p>
                    <p className={`text-2xl font-bold tabular-nums ${t.text} leading-tight`}>
                      {fmt(p.monthly)}<span className="text-sm font-normal ml-0.5">원</span>
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{p.basis}</p>

                    <div className="mt-3.5 pt-3 border-t border-gray-200/70 space-y-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-gray-500">{p.accumulatedLabel}</span>
                        <span className="text-sm font-semibold text-gray-800 tabular-nums">{fmtKRW(p.accumulated)}</span>
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                          <span>{p.progressLabel}</span>
                          <span className={`font-medium ${t.text}`}>{p.progressPct}%</span>
                        </div>
                        <div className="w-full bg-white/70 rounded-full h-1.5">
                          <div className={`${t.bar} h-1.5 rounded-full`} style={{ width: `${p.progressPct}%` }} />
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              국민연금만 공단 통보값(실적 기반)이고, 퇴직·개인연금은 커버드콜 연 {(ov.ccAnnualRate * 100).toFixed(1)}%가
              유지된다는 가정 위의 예상치입니다. 물가·건강보험료·세금은 반영하지 않았습니다.
            </p>
          </>
        )}
      </div>
    </AppLayout>
  )
}
