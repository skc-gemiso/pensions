"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import AppLayout from "@/components/AppLayout"
import HelpModal, { H, Box, ColTable } from "@/components/HelpModal"
import { fmt, fmtKRW, cc } from "@/lib/fmt"
import {
  getPensionOverview, getPensionHistory,
  type PensionOverview, type PensionKind, type PayoutStage,
  type PensionHistory, type HistoryKind,
} from "./actions"
import type { WithdrawScenario } from "@/lib/pension-ret-calc"
import type { EarlyPensionScenario } from "@/lib/pension-nat-calc"

const TONE: Record<HistoryKind, {
  text: string; dot: string; bar: string; ring: string
  cardBg: string; cardBorder: string; iconBg: string; track: string
}> = {
  all: {
    text: "text-gray-900", dot: "bg-gray-800", bar: "bg-gray-800", ring: "ring-gray-100",
    cardBg: "bg-gray-100", cardBorder: "border-gray-300",
    iconBg: "bg-gradient-to-br from-gray-700 to-gray-900", track: "bg-gray-100",
  },
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

const LABEL: Record<HistoryKind, string> = {
  all: "3연금 합계", per: "개인연금", ret: "퇴직연금", nat: "국민연금",
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

function PensionIcon({ kind, className = "w-5 h-5" }: { kind: HistoryKind; className?: string }) {
  // 합계 — 세 막대를 쌓은 모양
  if (kind === "all") return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M3 17h4v4H3zm7-6h4v10h-4zm7-8h4v18h-4z" />
    </svg>
  )
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
                ["퇴직연금", <>정년 퇴직금(실수령)을 커버드콜로 굴려 {per.startAge}세부터 받는 분배금. 급여명세서 평균임금 기준 추정</>],
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
/**
 * 연금별 과거 추이 표.
 *
 * 컬럼 구성이 연금마다 다르다 (개인=보유수량, 국민=총 납부액, 퇴직=없음).
 * 최신 달이 위로 오게 뒤집어 보여준다.
 */
function HistoryTable({ h }: { h: PensionHistory }) {
  const TH = "px-3 py-1.5 font-semibold text-gray-600 whitespace-nowrap"
  const TD = "px-3 py-1.5 tabular-nums whitespace-nowrap"
  const isAll = h.kind === "all"

  if (h.rows.length === 0) {
    return <p className="text-xs text-gray-400 py-6 text-center">기록된 자료가 없습니다</p>
  }

  return (
    <div className="max-h-[188px] overflow-y-auto rounded-lg border border-gray-200">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
          <tr>
            <th className={`${TH} text-left`}>월</th>
            {h.baseLabel && <th className={`${TH} text-right`}>{h.baseLabel}</th>}
            {isAll && (["per", "ret", "nat"] as PensionKind[]).map(k => (
              <th key={k} className={`${TH} text-right font-medium ${TONE[k].text}`}>{LABEL[k]}</th>
            ))}
            <th className={`${TH} text-right`}>{h.monthlyLabel}</th>
            <th className={`${TH} text-right`}>증가</th>
            <th className={`${TH} text-right`}>증가율</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {[...h.rows].reverse().map(r => (
            <tr key={r.ym} className="hover:bg-gray-50">
              <td className={`${TD} text-left text-gray-700`}>{r.ym.replace("-", ".")}</td>
              {h.baseLabel && (
                <td className={`${TD} text-right text-gray-700`}>
                  {r.base == null ? "-"
                    : h.baseUnit === "shares" ? `${fmt(r.base)}주`
                    : h.baseUnit === "pct" ? `${fmt(r.base, 2)}%`
                    : fmtKRW(r.base)}
                </td>
              )}
              {isAll && (["per", "ret", "nat"] as PensionKind[]).map(k => (
                <td key={k} className={`${TD} text-right text-gray-500`}>
                  {fmt(r.parts?.[k] ?? 0)}
                  {/* 국민연금은 확인 시점이 드물어 사이를 보간한다 — 추정치임을 표시 */}
                  {k === "nat" && r.parts?.natEstimated && <span className="text-gray-400">*</span>}
                </td>
              ))}
              <td className={`${TD} text-right font-semibold text-gray-900`}>{fmt(r.monthly)}원</td>
              <td className={`${TD} text-right ${cc(r.diff ?? 0)}`}>
                {r.diff == null ? <span className="text-gray-300">-</span>
                  : <>{r.diff > 0 ? "+" : ""}{fmt(r.diff)}</>}
              </td>
              <td className={`${TD} text-right font-semibold ${cc(r.diffPct ?? 0)}`}>
                {r.diffPct == null ? <span className="text-gray-300">-</span>
                  : <>{r.diffPct > 0 ? "+" : ""}{fmt(r.diffPct, 1)}%</>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
/**
 * 참고 — 중도인출 후 계속 재직하는 시나리오.
 *
 * 기존 계산을 대체하지 않는다. "만약" 을 붙여 별도 카드로 둔다.
 * 퇴직금을 두 번 받는 구조가 요점이라 두 몫을 나란히 보여준다.
 */
function WithdrawCard({ w, ov }: { w: WithdrawScenario; ov: PensionOverview }) {
  const t = TONE.ret
  const diff = w.totalMonthlyMan * 10_000 - w.baseMonthlyMan * 10_000
  const diffPct = w.baseMonthlyMan > 0
    ? (w.totalMonthlyMan / w.baseMonthlyMan - 1) * 100 : 0
  const netDiff = (w.totalNetMan - w.baseNetMan) * 10_000

  // 3연금 합계 — 퇴직연금만 시나리오 값으로 바꿔 더한다
  const others = ov.pensions.reduce((s, p) => s + (p.kind === "ret" ? 0 : p.monthly), 0)
  const baseTotal = others + w.baseMonthlyMan * 10_000
  const scenarioTotal = others + w.totalMonthlyMan * 10_000

  const legs = [w.early, w.final]

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-6 py-5">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
            참고
          </span>
          <h2 className="text-gray-900 font-semibold text-base">
            {w.withdrawYm} 에 퇴직금을 중도인출하고 정년까지 계속 다닌다면?
          </h2>
          <WithdrawHelp w={w} ov={ov} />
        </div>
        <p className="text-xs text-gray-400">
          기존 계산을 대체하지 않는 가정입니다 — 제도상 불가능할 수 있습니다
        </p>

        {/* 결론 두 줄 */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: `만 ${ov.pensions.find(p => p.kind === "ret")?.startAge}세 월 수령액 (퇴직연금)`,
              base: w.baseMonthlyMan * 10_000, now: w.totalMonthlyMan * 10_000, strong: true },
            { label: "3연금 합계", base: baseTotal, now: scenarioTotal, strong: false },
          ].map(row => (
            <div key={row.label} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">{row.label}</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-gray-400 tabular-nums line-through text-sm">{fmtKRW(row.base)}</span>
                <span className="text-gray-300">→</span>
                <span className={`font-bold tabular-nums ${row.strong ? `text-2xl ${t.text}` : "text-xl text-gray-900"}`}>
                  {fmtKRW(row.now)}
                </span>
                <span className={`text-xs font-semibold ${cc(row.now - row.base)}`}>
                  +{fmtKRW(row.now - row.base)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* 두 몫 */}
        <p className="text-sm font-semibold text-gray-800 mt-5 mb-2">
          퇴직금을 두 번 받습니다
          <span className={`ml-2 text-xs font-semibold ${cc(diff)}`}>
            합계 월 {fmtKRW(w.totalMonthlyMan * 10_000)} ({diffPct > 0 ? "+" : ""}{fmt(diffPct, 0)}%)
          </span>
        </p>
        <div className="rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">구분</th>
                <th className="px-3 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">근속 기간</th>
                <th className="px-3 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">평균임금</th>
                <th className="px-3 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">세전</th>
                <th className="px-3 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">퇴직소득세</th>
                <th className="px-3 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">실수령</th>
                <th className="px-3 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">매입 · 거치</th>
                <th className="px-3 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">월 분배금</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {legs.map(l => (
                <tr key={l.label} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-medium text-gray-900 whitespace-nowrap">{l.label}</td>
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                    {l.fromYm} ~ {l.toYm}
                    <span className="text-gray-400 ml-1">({fmt(l.tenureFloat, 2)}년)</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{fmtKRW(l.monthlyWageMan * 10_000)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{fmtKRW(l.grossMan * 10_000)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-red-400">
                    {fmtKRW(l.taxMan * 10_000)}
                    <span className="text-gray-300 ml-1">{l.tenureYears}년</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-gray-900">{fmtKRW(l.netMan * 10_000)}</td>
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{l.buyYm} · {l.holdMonths}개월</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${t.text}`}>
                    {fmtKRW(l.monthlyMan * 10_000)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500 mt-2.5 leading-relaxed">
          <b className="text-gray-700">퇴직금 총액 자체는 {fmtKRW(Math.abs(netDiff))} 적습니다</b> —
          인출분이 그 시점의 낮은 평균임금({fmtKRW(w.early.monthlyWageMan * 10_000)})으로 정산되기 때문입니다.
          그런데도 수령액이 느는 건 거치 기간이 {w.final.holdMonths}개월 → {w.early.holdMonths}개월로 늘어서입니다.
        </p>
      </div>
    </div>
  )
}

function WithdrawHelp({ w, ov }: { w: WithdrawScenario; ov: PensionOverview }) {
  const payoutAge = ov.pensions.find(p => p.kind === "ret")?.startAge ?? 63
  const mult = (m: number) => Math.pow(1 + ov.ccAnnualRate / 12, m).toFixed(2)

  return (
    <HelpModal
      title="중도인출 시나리오 안내"
      lead="기존 계산을 대체하지 않는 참고 가정입니다"
      tabs={[
        { key: "how", label: "어떻게 계산했나", body: (
          <>
            <Box>
              <H>퇴직금을 두 번 받는 구조입니다</H>
              <ColTable rows={[
                ["중도인출분", <>입사 ~ {w.early.toYm} 근속 {fmt(w.early.tenureFloat, 2)}년.
                  인출 즉시 커버드콜로 매입해 {payoutAge}세까지 {w.early.holdMonths}개월 굴립니다</>],
                ["정년 추가분", <>{w.final.fromYm} ~ {w.final.toYm} 근속 {fmt(w.final.tenureFloat, 2)}년.
                  <b> 계속 다녀서 새로 쌓이는</b> 퇴직금이지, 남은 잔액이 아닙니다</>],
              ]} />
            </Box>
            <Box>
              <H>정년 추가분이 인출 시점부터 다시 세어지는 이유</H>
              <p className="text-xs text-gray-700 leading-relaxed">
                중간정산을 하면 <b>퇴직금 기산일이 정산 시점으로 리셋</b>됩니다.
                그래서 정년에 받는 몫은 {w.final.fromYm} 이후 근속만 반영합니다.
                퇴직소득세도 두 몫에 각각 매겨져, 근속연수가 {w.early.tenureYears}년 · {w.final.tenureYears}년으로
                따로 잡힙니다.
              </p>
            </Box>
          </>
        ) },
        { key: "why", label: "왜 더 늘어나나", body: (
          <>
            <Box tone="emerald">
              <H>거치 기간이 전부입니다</H>
              <ColTable rows={[
                ["중도인출분", <>{w.early.buyYm} 매입 → <b>{w.early.holdMonths}개월</b> 재투자 → 원금의 <b>{mult(w.early.holdMonths)}배</b></>],
                ["정년 추가분", <>{w.final.buyYm} 매입 → {w.final.holdMonths}개월 재투자 → 원금의 {mult(w.final.holdMonths)}배</>],
              ]} />
              <p className="text-xs text-gray-700 leading-relaxed mt-2">
                연 {(ov.ccAnnualRate * 100).toFixed(1)}%로 재투자하면 5년 차이가 배수를 두 배 넘게 벌립니다.
              </p>
            </Box>
            <Box tone="amber">
              <H>대신 퇴직금 총액은 줄어듭니다</H>
              <p className="text-xs text-gray-700 leading-relaxed">
                인출분을 {w.early.toYm} 시점의 평균임금 <b>{fmtKRW(w.early.monthlyWageMan * 10_000)}</b>으로 정산하기 때문입니다.
                정년까지 한 번에 가면 전체 근속에 <b>{fmtKRW(w.final.monthlyWageMan * 10_000)}</b>이 적용됩니다.
                실수령 합계가 {fmtKRW(w.baseNetMan * 10_000)} → {fmtKRW(w.totalNetMan * 10_000)} 로 줄지만,
                복리가 그 차이를 덮습니다.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                세금은 두 번으로 쪼개지며 누진이 완화돼 오히려 줄어듭니다 —
                한 번에 {fmtKRW(w.baseTaxMan * 10_000)} vs 나눠서 {fmtKRW(w.totalTaxMan * 10_000)}.
              </p>
            </Box>
          </>
        ) },
        { key: "limit", label: "⚠️ 성립하지 않을 수 있다", body: (
          <Box tone="amber">
            <H>⚠️ 제도상 불가능할 수 있습니다</H>
            <ul className="text-xs text-gray-700 space-y-2 list-disc pl-4 leading-relaxed">
              <li><b>DB형 퇴직연금은 중도인출 규정 자체가 없습니다.</b> 근로자퇴직급여보장법의
                중도인출은 DC형·IRP 대상입니다.</li>
              <li><b>법정 퇴직금의 중간정산도 사유가 정해져 있습니다.</b> 무주택자 주택구입,
                전세보증금, 6개월 이상 요양, 파산·개인회생, 천재지변 등이며 회사 규정도 따라야 합니다.</li>
              <li><b>분배율 가정에 {Math.round(w.early.holdMonths / 12)}년을 더 기댑니다.</b>
                연 {(ov.ccAnnualRate * 100).toFixed(1)}%가 흔들리면 기준 시나리오보다 훨씬 크게 흔들립니다.</li>
              <li><b>주가 하락이 반영돼 있지 않습니다.</b> 인출한 원금이 {w.early.holdMonths}개월간
                시장에 노출됩니다.</li>
              <li>인출액을 <b>전액 재투자</b>한다고 봤습니다. 생활비로 쓰면 그만큼 줄어듭니다.</li>
            </ul>
          </Box>
        ) },
      ]}
    />
  )
}

// ─────────────────────────────────────────────
/**
 * 참고 — 국민연금을 앞당겨 받아 커버드콜에 적립하는 시나리오.
 *
 * 감액은 평생이지만, 앞당겨 받은 돈이 굴러가면서 감액분을 만회하는지 본다.
 */
function EarlyPensionCard({ e, ov }: { e: EarlyPensionScenario; ov: PensionOverview }) {
  const t = TONE.nat
  const gain = e.totalMonthly - e.baseMonthly

  // 3연금 합계 — 국민연금만 시나리오 값으로 바꿔 더한다
  const others = ov.pensions.reduce((s, p) => s + (p.kind === "nat" ? 0 : p.monthly), 0)
  const baseTotal = others + e.baseMonthly
  const scenarioTotal = others + e.totalMonthly

  const perAge = ov.pensions.find(p => p.kind === "per")?.startAge ?? 63

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-6 py-5">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
            참고
          </span>
          <h2 className="text-gray-900 font-semibold text-base">
            국민연금을 {e.earlyYears}년 앞당겨 받아 커버드콜에 적립한다면?
          </h2>
          <EarlyPensionHelp e={e} ov={ov} />
        </div>
        <p className="text-xs text-gray-400">
          기존 계산을 대체하지 않는 가정입니다 — 감액은 평생 이어집니다
        </p>

        {/* 결론 두 줄 */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: `만 ${e.investUntilAge}세 이후 월 수령액 (국민연금)`,
              base: e.baseMonthly, now: e.totalMonthly, strong: true },
            { label: "3연금 합계", base: baseTotal, now: scenarioTotal, strong: false },
          ].map(row => (
            <div key={row.label} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">{row.label}</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-gray-400 tabular-nums line-through text-sm">{fmtKRW(row.base)}</span>
                <span className="text-gray-300">→</span>
                <span className={`font-bold tabular-nums ${row.strong ? `text-2xl ${t.text}` : "text-xl text-gray-900"}`}>
                  {fmtKRW(row.now)}
                </span>
                <span className={`text-xs font-semibold ${cc(row.now - row.base)}`}>
                  +{fmtKRW(row.now - row.base)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* 흐름 */}
        <p className="text-sm font-semibold text-gray-800 mt-5 mb-2">
          {e.earlyYears}년 앞당겨 받고 그만큼을 굴립니다
          <span className={`ml-2 text-xs font-semibold ${cc(gain)}`}>
            월 {fmtKRW(e.totalMonthly)} (+{Math.round(gain / e.baseMonthly * 100)}%)
          </span>
        </p>
        <div className="rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">시점</th>
                <th className="px-3 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">무슨 일이</th>
                <th className="px-3 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">국민연금</th>
                <th className="px-3 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">ETF 분배금</th>
                <th className="px-3 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">월 합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr className="hover:bg-gray-50">
                <td className="px-3 py-1.5 font-medium text-gray-900 whitespace-nowrap">
                  만 {e.startAge}세 ~ {e.investUntilAge}세
                </td>
                <td className="px-3 py-1.5 text-gray-500">
                  {e.startYm.replace("-", ".")} 조기수령 시작 · {e.investMonths}개월 전액 적립
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-400">
                  {fmtKRW(e.earlyMonthly)} <span className="text-gray-300">적립</span>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-300">-</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-400">0원</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-3 py-1.5 font-medium text-gray-900 whitespace-nowrap">
                  만 {e.investUntilAge}세 ~
                </td>
                <td className="px-3 py-1.5 text-gray-500">
                  {e.investUntilYm.replace("-", ".")} 부터 연금은 생활비로 · 적립분 {fmtKRW(e.investedValue)} 유지
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{fmtKRW(e.earlyMonthly)}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${t.text}`}>
                  {fmtKRW(e.investMonthly)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-bold text-gray-900">
                  {fmtKRW(e.totalMonthly)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500 mt-2.5 leading-relaxed">
          <b className="text-gray-700">
            만 {e.startAge}~{perAge}세는 세 연금 모두 수입이 없습니다
          </b> — 정년 이후 개인·퇴직연금이 시작되기 전이고, 국민연금마저 적립에 들어가기 때문입니다.
          그 기간의 생활비가 따로 있어야 성립합니다.
        </p>
      </div>
    </div>
  )
}

function EarlyPensionHelp({ e, ov }: { e: EarlyPensionScenario; ov: PensionOverview }) {
  const perAge = ov.pensions.find(p => p.kind === "per")?.startAge ?? 63

  return (
    <HelpModal
      title="국민연금 조기수령 시나리오 안내"
      lead="기존 계산을 대체하지 않는 참고 가정입니다"
      tabs={[
        { key: "how", label: "어떻게 계산했나", body: (
          <>
            <Box>
              <H>조기노령연금은 1년당 6%씩 깎입니다</H>
              <ColTable rows={[
                ["감액", <>{e.earlyYears}년 × 6% = <b>{e.discountPct}%</b>.
                  {fmtKRW(e.baseMonthly)} → <b>{fmtKRW(e.earlyMonthly)}</b></>],
                ["기간", <>만 {e.startAge}세({e.startYm.replace("-", ".")})부터 <b>평생</b> 이 금액입니다.
                  나중에 원래대로 돌아오지 않습니다</>],
                ["적립", <>만 {e.investUntilAge}세까지 {e.investMonths}개월간 전액 매수 —
                  총 {fmtKRW(e.contributed)} 납입</>],
                ["평가액", <>분배금 재투자로 <b>{fmtKRW(e.investedValue)}</b>
                  ({(e.investedValue / Math.max(1, e.contributed)).toFixed(2)}배)</>],
              ]} />
            </Box>
            <Box>
              <H>원금은 헐지 않습니다</H>
              <p className="text-xs text-gray-700 leading-relaxed">
                만 {e.investUntilAge}세부터는 국민연금을 생활비로 쓰고, ETF 는 수량을 그대로 둔 채
                <b> 분배금만</b> 받습니다. 그래서 월 {fmtKRW(e.investMonthly)}이 줄지 않습니다.
              </p>
            </Box>
          </>
        ) },
        { key: "why", label: "손익 계산", body: (
          <>
            <Box tone="emerald">
              <H>감액분보다 분배금이 큽니다</H>
              <ColTable rows={[
                ["잃는 것", <>매월 <b>{fmtKRW(e.baseMonthly - e.earlyMonthly)}</b> 감액 (평생)</>],
                ["얻는 것", <>매월 <b>{fmtKRW(e.investMonthly)}</b> 분배금 +
                  {e.earlyYears}년 일찍 받는 {fmtKRW(e.contributed)}</>],
                ["순증", <>월 <b>{fmtKRW(e.totalMonthly - e.baseMonthly)}</b>
                  (+{Math.round((e.totalMonthly / e.baseMonthly - 1) * 100)}%)</>],
              ]} />
              <p className="text-xs text-gray-700 leading-relaxed mt-2">
                연 {(ov.ccAnnualRate * 100).toFixed(1)}%로 {e.investMonths}개월 적립하면
                납입액의 {(e.investedValue / Math.max(1, e.contributed)).toFixed(2)}배가 됩니다.
                감액률 {e.discountPct}%보다 분배 수익이 커서 뒤집힙니다.
              </p>
            </Box>
            <Box tone="amber">
              <H>물가 연동을 잃는 게 진짜 비용입니다</H>
              <p className="text-xs text-gray-700 leading-relaxed">
                국민연금은 물가에 연동돼 매년 오르지만, <b>깎인 {e.discountPct}%는 그 인상분에도 그대로 적용</b>됩니다.
                시간이 갈수록 감액의 절대 금액이 커집니다. 반면 ETF 분배금은 물가 연동이 없습니다.
                이 표는 <b>물가를 반영하지 않은</b> 비교라, 오래 살수록 조기수령이 불리해집니다.
              </p>
            </Box>
          </>
        ) },
        { key: "limit", label: "⚠️ 한계", body: (
          <Box tone="amber">
            <H>⚠️ 이 숫자를 그대로 믿으면 안 되는 이유</H>
            <ul className="text-xs text-gray-700 space-y-2 list-disc pl-4 leading-relaxed">
              <li><b>만 {e.startAge}~{perAge}세는 수입이 0입니다.</b> 정년 이후 개인·퇴직연금 개시 전이고
                국민연금마저 적립에 들어갑니다. 그 기간 생활비가 따로 있어야 합니다.</li>
              <li><b>조기노령연금은 소득이 있으면 못 받습니다.</b> 일정 수준 이상의 사업·근로소득이
                있으면 수급이 정지됩니다.</li>
              <li><b>감액은 되돌릴 수 없습니다.</b> 한 번 조기수령을 선택하면 평생 {e.discountPct}% 깎인
                금액을 받습니다.</li>
              <li><b>분배율 {(ov.ccAnnualRate * 100).toFixed(1)}%가 유지된다는 가정</b>입니다.
                주가가 떨어지면 평가액도 분배금도 함께 줄어듭니다.</li>
              <li><b>물가·건강보험료·세금</b>은 반영돼 있지 않습니다.</li>
            </ul>
          </Box>
        ) },
      ]}
    />
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

  // 과거 추이는 요약과 따로 부른다 — 첫 페인트를 막지 않도록
  const [history, setHistory] = useState<PensionHistory[] | null>(null)
  const [tab, setTab] = useState<HistoryKind>("all")
  useEffect(() => {
    let alive = true
    getPensionHistory()
      .then(h => { if (alive) setHistory(h) })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  const active = history?.find(h => h.kind === tab) ?? null

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
              <div className="px-6 py-6">
                {/* 합계 + 먼저 받는 시점 */}
                <div className="flex items-start justify-between gap-6 flex-wrap">
                  <div>
                    <p className="text-gray-500 text-lg">
                      만 {last.fromAge}세 ~ {fmtYm(last.fromYm)}부터 연금 수령 예상
                    </p>
                    <p className="text-gray-900 text-[56px] font-bold tabular-nums leading-tight mt-0.5">
                      {fmt(last.total)}
                      <span className="text-xl font-medium text-gray-500 ml-1.5">원 / 월</span>
                    </p>
                    <p className="text-gray-500 text-base mt-1">연 {fmtKRW(last.total * 12)}</p>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-3">
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

                {/* 연금별 과거 추이 — 연금마다 컬럼이 달라 탭으로 나눈다 */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(["all", "per", "ret", "nat"] as HistoryKind[]).map(k => {
                        const t = TONE[k]
                        const on = tab === k
                        return (
                          <button key={k} type="button" onClick={() => setTab(k)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors
                              ${on ? `${t.cardBg} ${t.cardBorder} ${t.text}`
                                   : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}
                              ${k === "all" ? "mr-1.5" : ""}`}>
                            <PensionIcon kind={k} className="w-3.5 h-3.5" />
                            {LABEL[k]}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-gray-400">
                      {active?.rangeLabel ?? "불러오는 중…"}
                      {active?.changePct != null && (
                        <span className={`ml-1.5 font-semibold ${cc(active.changePct)}`}>
                          {active.changePct > 0 ? "+" : ""}{fmt(active.changePct, 1)}%
                        </span>
                      )}
                    </p>
                  </div>

                  {active == null ? (
                    <div className="h-[188px] rounded-lg border border-gray-200 bg-gray-50/50 animate-pulse" />
                  ) : (
                    <>
                      <p className="text-[11px] text-gray-400 mb-1.5">{active.basisNote}</p>
                      <HistoryTable h={active} />
                    </>
                  )}
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
                        <b className={`font-semibold ${TONE[p.kind].text}`}>
                          {Math.round(p.monthly / last.total * 100)}%
                        </b>
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

            {/* ── 참고 시나리오 — 각각 환경 변수가 있을 때만 렌더링한다 ── */}
            {ov.withdraw && <WithdrawCard w={ov.withdraw} ov={ov} />}
            {ov.early && <EarlyPensionCard e={ov.early} ov={ov} />}
          </>
        )}
      </div>
    </AppLayout>
  )
}
