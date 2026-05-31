"use client"

import { useState, useEffect, useCallback, Fragment } from "react"
import { createPortal } from "react-dom"
import { useSession } from "next-auth/react"
import AppLayout from "@/components/AppLayout"
import { Kodex200Panel } from "./Kodex200Panel"
import {
  saveSimulation,
  loadSimulations,
  deleteSimulation,
  checkAndRecordIpUsage,
  type InputValues,
  type ComputedRow,
  type SavedSim,
} from "./actions"

// ─── 상수 ────────────────────────────────────────────────────────────────────

const ANNUAL_RATES = [-0.2, -0.1, 0, 0.05, 0.1, 0.2]
const RATE_LABELS  = ["-20%", "-10%", "0%", "5%", "10%", "20%"]

const NOTES = [
  "KODEX200 타겟위클리커버드콜 ETF : 목표 배당률 연 15% (세후 약 12%, 시장 상황에 따라 변동)",
]

const IRP_NOTES = [
  "IRP 의무 투자 비율 : 안전자산(채권·적금) 30% + ETF(KODEX200 또는 커버드콜) 70%",
  "시뮬레이션 결과는 두 자산을 합산한 기준 (안전자산 연복리 · ETF 월복리)",
  "KODEX200 타겟위클리커버드콜 ETF : 목표 배당률 연 15% (세후 약 12%, 시장 상황에 따라 변동)",
]

type TabMeta = {
  id: string
  label: string
  defaultInputs?: InputValues
  isIRP?: boolean
  isKodex200?: boolean
}

const TABS: TabMeta[] = [
  {
    id: "reference",
    label: "수익율 확인",
    defaultInputs: { initDeposit: 0, monthlyPmt: 200000, accumMonths: 120, holdMonths: 60, ccAnnualRate: 0.12, retirementAge: 55, birthdate: "2000-01-01" },
  },
  {
    id: "irp-reference",
    label: "IRP 수익율 확인",
    isIRP: true,
    defaultInputs: { initDeposit: 0, monthlyPmt: 200000, accumMonths: 120, holdMonths: 60, ccAnnualRate: 0.12, retirementAge: 55, birthdate: "2000-01-01", safeRate: 0.05 },
  },
  {
    id: "kodex200",
    label: "주가 비교",
    isKodex200: true,
  },
]

function birthdateToAgeMonths(birthdate: string): number | null {
  if (!birthdate) return null
  const birth = new Date(birthdate)
  if (isNaN(birth.getTime())) return null
  const now = new Date()
  return Math.max(0, (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth()))
}

function fmtAge(ageMonths: number): string {
  const y = Math.floor(ageMonths / 12)
  const m = ageMonths % 12
  return m > 0 ? `만 ${y}세 ${m}개월` : `만 ${y}세`
}

function fmtBirthdate(iso: string): string {
  if (!iso) return ""
  const [y, mo, d] = iso.split("-")
  return `${y}년 ${Number(mo)}월 ${Number(d)}일`
}

function calcHoldMonths(retirementAge: number, accumMonths: number, ageMonths: number): number {
  return Math.max(0, retirementAge * 12 - ageMonths - accumMonths)
}

function validateDraft(draft: InputValues): string[] {
  const errs: string[] = []

  if (draft.initDeposit < 0 || draft.initDeposit > 10_000_000_000)
    errs.push("초기 입금은 0원 ~ 100억원 사이여야 합니다.")

  if (draft.monthlyPmt < 0 || draft.monthlyPmt > 100_000_000)
    errs.push("월 납입금은 0원 ~ 1억원 사이여야 합니다.")

  if (draft.retirementAge < 55 || draft.retirementAge > 80)
    errs.push("연금 수령 나이는 만 55세 ~ 80세 사이여야 합니다.")

  if (draft.ccAnnualRate < 0 || draft.ccAnnualRate > 0.5)
    errs.push("커버드콜 배당률은 0% ~ 50% 사이여야 합니다.")

  if (draft.safeRate != null && (draft.safeRate < 0 || draft.safeRate > 0.5))
    errs.push("안전자산 수익율은 0% ~ 50% 사이여야 합니다.")

  if (draft.accumMonths < 1 || draft.accumMonths > 600)
    errs.push("적립 기간은 1 ~ 600개월 사이여야 합니다.")

  if (draft.birthdate) {
    const year = new Date(draft.birthdate).getFullYear()
    if (year < 1940 || year > 2050)
      errs.push("생년월일은 1940년 ~ 2050년 사이여야 합니다.")
  }

  const ageMonths = birthdateToAgeMonths(draft.birthdate)
  if (ageMonths != null) {
    if (ageMonths >= draft.retirementAge * 12)
      errs.push("현재 나이가 연금 수령 나이 이상입니다. 연금 수령 나이를 높여주세요.")
    else if (draft.retirementAge * 12 - ageMonths - draft.accumMonths <= 0)
      errs.push("적립 완료 시점이 연금 수령 나이를 초과합니다. 연금 수령 나이를 높이거나 적립 기간을 줄여주세요.")
  }

  return errs
}

// ─── 계산 로직 ────────────────────────────────────────────────────────────────

function fv(init: number, pmt: number, months: number, r: number): number {
  if (Math.abs(r) < 1e-12) return init + pmt * months
  const g = Math.pow(1 + r, months)
  return init * g + pmt * (g - 1) / r
}

function fmtWan(n: number): string {
  return Math.round(n).toLocaleString("ko-KR")
}

function retPct(val: number, invested: number): string {
  const p = Math.round((val / invested - 1) * 100)
  return (p >= 0 ? "+" : "") + p.toLocaleString("ko-KR") + "%"
}

function diffPct(d: number, invested: number): string {
  const p = Math.round((d / invested) * 100)
  return (p >= 0 ? "+" : "") + p.toLocaleString("ko-KR") + "%"
}

function calculateRows(inp: InputValues): ComputedRow[] {
  const initW   = inp.initDeposit / 10000
  const pmtW    = inp.monthlyPmt  / 10000
  const invested = initW + pmtW * inp.accumMonths

  return ANNUAL_RATES.map((ar, i) => {
    const rEtf = Math.pow(1 + ar, 1 / 12) - 1
    const rCc  = rEtf + inp.ccAnnualRate / 12

    const etf1  = fv(initW, pmtW, inp.accumMonths, rEtf)
    const cc1   = fv(initW, pmtW, inp.accumMonths, rCc)
    const diff1 = cc1 - etf1

    const etf2  = etf1 * Math.pow(1 + rEtf, inp.holdMonths)
    const cc2   = cc1  * Math.pow(1 + rCc,  inp.holdMonths)
    const diff2 = cc2  - etf2

    const divAnnual  = cc2 * inp.ccAnnualRate
    const divMonthly = divAnnual / 12

    return {
      rate: RATE_LABELS[i],
      kodex:   [fmtWan(etf1),  retPct(etf1,  invested), fmtWan(etf2),  retPct(etf2,  invested)],
      covered: [fmtWan(cc1),   retPct(cc1,   invested), fmtWan(cc2),   retPct(cc2,   invested)],
      diff:    [fmtWan(diff1), diffPct(diff1, invested), fmtWan(diff2), diffPct(diff2, invested)],
      dividend: [fmtWan(divAnnual), fmtWan(divMonthly)],
    } as ComputedRow
  })
}

// ─── IRP 시뮬레이션 (30% 안전자산 + 70% ETF) ──────────────────────────────────
// KODEX200 컬럼: 30% 안전자산(연복리) + 70% KODEX200(월복리)
// 커버드콜 컬럼: 30% 안전자산(연복리) + 70% 커버드콜(월복리)

function calculateIRPRows(inp: InputValues): ComputedRow[] {
  const rSafeM = Math.pow(1 + (inp.safeRate ?? 0.05), 1 / 12) - 1

  const initW    = inp.initDeposit / 10000
  const pmtW     = inp.monthlyPmt  / 10000
  const invested = initW + pmtW * inp.accumMonths

  return ANNUAL_RATES.map((ar, i) => {
    const rEtfM = Math.pow(1 + ar, 1 / 12) - 1
    const rCcM  = rEtfM + inp.ccAnnualRate / 12

    // 안전자산 30% (두 컬럼 공통)
    const safe1 = fv(initW * 0.30, pmtW * 0.30, inp.accumMonths, rSafeM)
    const safe2 = safe1 * Math.pow(1 + rSafeM, inp.holdMonths)

    // KODEX200 70% + 안전자산 30%
    const etfRisky1 = fv(initW * 0.70, pmtW * 0.70, inp.accumMonths, rEtfM)
    const etfRisky2 = etfRisky1 * Math.pow(1 + rEtfM, inp.holdMonths)
    const etf1 = etfRisky1 + safe1
    const etf2 = etfRisky2 + safe2

    // 커버드콜 70% + 안전자산 30%
    const ccRisky1 = fv(initW * 0.70, pmtW * 0.70, inp.accumMonths, rCcM)
    const ccRisky2 = ccRisky1 * Math.pow(1 + rCcM, inp.holdMonths)
    const cc1 = ccRisky1 + safe1
    const cc2 = ccRisky2 + safe2

    const diff1 = cc1 - etf1
    const diff2 = cc2 - etf2

    // 배당은 커버드콜 70% 부분에서만 발생
    const divAnnual  = ccRisky2 * inp.ccAnnualRate
    const divMonthly = divAnnual / 12

    return {
      rate:     RATE_LABELS[i],
      kodex:    [fmtWan(etf1), retPct(etf1, invested), fmtWan(etf2), retPct(etf2, invested)],
      covered:  [fmtWan(cc1),  retPct(cc1,  invested), fmtWan(cc2),  retPct(cc2,  invested)],
      diff:     [fmtWan(diff1), diffPct(diff1, invested), fmtWan(diff2), diffPct(diff2, invested)],
      dividend: [fmtWan(divAnnual), fmtWan(divMonthly)],
    } as ComputedRow
  })
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function fmtMonths(m: number) {
  const y = Number(m / 12).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${m.toLocaleString("ko-KR")}개월 (${y}년)`
}

function fmtKRW(n: number) {
  return n.toLocaleString("ko-KR") + "원"
}

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  })
}

function rateColor(v: string) {
  if (v.startsWith("+")) return "text-red-600"
  if (v.startsWith("-")) return "text-blue-600"
  return "text-gray-700"
}

// ─── 헬프 팝오버 ─────────────────────────────────────────────────────────────

type HelpPopoverProps = {
  title: string
  desc?: string
  composition?: string[]
  pros?: string[]
  cons?: string[]
  href: string
}

function HelpPopover({ title, desc, composition, pros, cons, href }: HelpPopoverProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (pos) { setPos(null); return }
    const r = e.currentTarget.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: r.left + r.width / 2 })
  }

  return (
    <span className="inline-block align-middle ml-1">
      <button
        onClick={toggle}
        className="w-4 h-4 inline-flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#3B82F6" strokeWidth="2" fill="white"/>
            <circle cx="12" cy="8" r="1.5" fill="#3B82F6"/>
            <rect x="11" y="11" width="2" height="6" rx="1" fill="#3B82F6"/>
          </svg>
      </button>
      {pos && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPos(null)} />
          <div
            className="fixed z-50 w-84 bg-white rounded-xl shadow-2xl border border-gray-200 text-left overflow-hidden"
            style={{ top: pos.top, left: pos.left, transform: "translateX(-50%)", width: "22rem", maxHeight: "80vh", overflowY: "auto" }}
          >
            {/* 헤더 */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <p className="font-bold text-sm text-gray-900">{title}</p>
              {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
            </div>

            <div className="p-4 space-y-3">
              {/* 주요 구성 */}
              {composition && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">📊 주요 구성</p>
                  <ul className="space-y-0.5">
                    {composition.map((c, i) => (
                      <li key={i} className="text-xs text-gray-600 flex gap-1"><span className="text-gray-400">·</span>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 장점 */}
              {pros && (
                <div className="bg-blue-50 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-blue-800 mb-1">✅ 장점</p>
                  <ul className="space-y-0.5">
                    {pros.map((p, i) => (
                      <li key={i} className="text-xs text-blue-700 flex gap-1"><span>·</span>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 단점 */}
              {cons && (
                <div className="bg-red-50 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-red-800 mb-1">⚠️ 단점</p>
                  <ul className="space-y-0.5">
                    {cons.map((c, i) => (
                      <li key={i} className="text-xs text-red-700 flex gap-1"><span>·</span>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 링크 */}
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="block text-xs text-blue-600 hover:underline pt-1"
              >
                공식 상품 페이지 →
              </a>
            </div>
          </div>
        </>,
        document.body
      )}
    </span>
  )
}

// ─── 페이지 도움말 모달 ───────────────────────────────────────────────────────

function DisclaimerModal() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex-shrink-0 text-xs font-medium text-amber-700 bg-white border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap"
      >
        상세보기 →
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900">면책조항 (Disclaimer)</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-5 text-sm">

              {/* 핵심 경고 */}
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="font-bold text-red-800 mb-1">⚠ 투자 원금 손실 가능성</p>
                <p className="text-red-700 text-xs leading-relaxed">
                  이 시뮬레이션은 ETF 투자에 따른 수익을 추정하는 도구입니다.
                  주식·ETF 투자는 원금이 보장되지 않으며, 시장 상황에 따라 투자한 금액보다
                  적은 금액을 돌려받을 수 있습니다.
                </p>
              </div>

              {/* 항목별 상세 */}
              <div className="space-y-4">

                <div>
                  <p className="font-semibold text-gray-800 mb-1.5">📊 시뮬레이션의 한계</p>
                  <ul className="space-y-1.5 text-xs text-gray-600">
                    <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">·</span><span>이 페이지의 시뮬레이션 결과는 <span className="font-semibold">미래 수익을 예측하거나 보장하지 않습니다.</span></span></li>
                    <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">·</span><span>입력한 연평균 수익률은 가정치이며, 실제 시장은 그보다 높거나 낮게 움직일 수 있습니다.</span></li>
                    <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">·</span><span>과거의 수익률이 미래에도 동일하게 반복된다는 보장은 없습니다.</span></li>
                    <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">·</span><span>커버드콜 ETF의 배당률(연 15%)은 시장 변동성에 따라 달라질 수 있습니다.</span></li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-gray-800 mb-1.5">💰 세금·수수료 미반영</p>
                  <ul className="space-y-1.5 text-xs text-gray-600">
                    <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">·</span><span>시뮬레이션 금액에는 <span className="font-semibold">운용보수·거래수수료·배당소득세·연금소득세</span>가 반영되어 있지 않습니다.</span></li>
                    <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">·</span><span>실제 수령액은 세금 및 수수료 공제 후 시뮬레이션보다 낮을 수 있습니다.</span></li>
                    <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">·</span><span>세율·세법은 정부 정책에 따라 변경될 수 있습니다.</span></li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-gray-800 mb-1.5">📋 정보 제공 목적</p>
                  <ul className="space-y-1.5 text-xs text-gray-600">
                    <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">·</span><span>이 서비스는 <span className="font-semibold">개인 학습 및 참고 목적</span>으로 제공되며, 금융투자상품의 매수·매도를 권유하거나 투자를 자문하는 서비스가 아닙니다.</span></li>
                    <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">·</span><span>금융 관련 중요한 결정을 내리기 전에는 <span className="font-semibold">자격을 갖춘 금융 전문가(FP·투자상담사 등)와 반드시 상담</span>하시기 바랍니다.</span></li>
                    <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">·</span><span>이 페이지에 표시되는 상품명·수치는 공개된 정보를 기반으로 작성되었으며, 최신 정보와 다를 수 있습니다.</span></li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-gray-800 mb-1.5">🔒 책임의 한계</p>
                  <ul className="space-y-1.5 text-xs text-gray-600">
                    <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">·</span><span>이 시뮬레이션 결과를 참고하여 내린 투자 결정으로 발생한 손실에 대해 이 서비스는 <span className="font-semibold">어떠한 법적 책임도 지지 않습니다.</span></span></li>
                    <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">·</span><span>모든 투자 결정과 그에 따른 결과는 <span className="font-semibold">투자자 본인의 책임</span>입니다.</span></li>
                  </ul>
                </div>

              </div>

              {/* 동의 버튼 */}
              <button
                onClick={() => setOpen(false)}
                className="w-full py-2.5 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-xl transition-colors"
              >
                확인했습니다
              </button>

            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

function PageHelpModal() {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<"guide" | "accounts" | "criteria" | "summary" | "detail">("guide")

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="도움말"
        className="inline-flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#3B82F6" strokeWidth="2" fill="white"/>
            <circle cx="12" cy="8" r="1.5" fill="#3B82F6"/>
            <rect x="11" y="11" width="2" height="6" rx="1" fill="#3B82F6"/>
          </svg>
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900">연금투자 시뮬레이션 안내</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            {/* 탭 */}
            <div className="flex gap-1 px-6 pt-3 flex-shrink-0 flex-wrap">
              {(["guide", "accounts", "criteria", "summary", "detail"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSection(s)}
                  className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                    section === s ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {s === "guide" ? "🚀 초보 가이드" : s === "accounts" ? "계좌 유형" : s === "criteria" ? "투자 기준" : s === "summary" ? "화면 기능 요약" : "화면 상세 안내"}
                </button>
              ))}
            </div>

            {/* 본문 */}
            <div className="overflow-y-auto px-6 py-4 space-y-5 text-sm">

              {section === "guide" && (
                <div className="space-y-5">

                  {/* 헤드라인 */}
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl px-5 py-4 text-white">
                    <p className="font-bold text-base mb-1">지금 당장 따라 하면 됩니다</p>
                    <p className="text-sm text-blue-100">복잡하게 생각할 필요 없습니다. 아래 순서대로만 하면 노후 준비 끝.</p>
                  </div>

                  {/* 왜 해야 하나 */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="font-semibold text-amber-900 mb-2">💡 딱 두 가지만 기억하세요</p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-white rounded-lg p-3 border border-amber-100">
                        <p className="font-bold text-amber-800 mb-1">세액공제 = 국가 보조금</p>
                        <p className="text-gray-600">연금저축에 월 50만원 넣으면 연말에 <span className="font-semibold text-amber-700">약 99만원</span> 돌려받음 (16.5% 기준, 총급여 5,500만원 이하). 투자 원금의 일부를 국가가 내주는 것.</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-amber-100">
                        <p className="font-bold text-amber-800 mb-1">복리 = 시간이 돈</p>
                        <p className="text-gray-600">월 20만원씩 20년, 연 12% 복리면 <span className="font-semibold text-amber-700">약 2억</span>. 시작이 1년 늦으면 수백만 원 손해. 오늘이 가장 빠른 날.</p>
                      </div>
                    </div>
                  </div>

                  {/* 5단계 실행 가이드 */}
                  <div className="space-y-3">
                    <p className="font-semibold text-gray-800">📋 무조건 따라 할 5단계</p>

                    {/* STEP 1 */}
                    <div className="rounded-xl border border-blue-200 overflow-hidden">
                      <div className="bg-blue-600 px-4 py-2 flex items-center gap-2">
                        <span className="bg-white text-blue-600 font-bold text-xs px-2 py-0.5 rounded-full">STEP 1</span>
                        <p className="text-white font-semibold text-sm">연금저축펀드 개설 — 오늘 바로</p>
                      </div>
                      <div className="p-4 space-y-2 text-xs">
                        <div className="flex gap-2 items-start">
                          <span className="bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded flex-shrink-0">어디서</span>
                          <span className="text-gray-700">증권사 앱 (삼성증권·미래에셋·키움·NH투자 등 어디든 동일) → 앱 설치 후 <span className="font-semibold">연금저축펀드 개설</span> 검색</span>
                        </div>
                        <div className="flex gap-2 items-start">
                          <span className="bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded flex-shrink-0">얼마나</span>
                          <span className="text-gray-700">목표는 <span className="font-semibold">월 50만원</span> (연 600만원 = 세액공제 한도). 여유 없으면 <span className="font-semibold">월 10만원부터</span>도 충분, 금액보다 꾸준함이 중요</span>
                        </div>
                        <div className="flex gap-2 items-start">
                          <span className="bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded flex-shrink-0">시간</span>
                          <span className="text-gray-700">신분증 하나면 앱에서 <span className="font-semibold">5~10분</span> 안에 개설 완료</span>
                        </div>
                        <div className="bg-blue-50 rounded-lg px-3 py-2 mt-1">
                          <p className="text-blue-700">✔ 가장 먼저 하는 이유 — 투자 제한 없고, 중도 인출 일부 가능, 세액공제까지. IRP보다 유연해서 초보에게 딱.</p>
                        </div>
                      </div>
                    </div>

                    {/* STEP 2 */}
                    <div className="rounded-xl border border-emerald-200 overflow-hidden">
                      <div className="bg-emerald-600 px-4 py-2 flex items-center gap-2">
                        <span className="bg-white text-emerald-600 font-bold text-xs px-2 py-0.5 rounded-full">STEP 2</span>
                        <p className="text-white font-semibold text-sm">ETF 하나만 매수 — 고민 말고 이것만</p>
                      </div>
                      <div className="p-4 space-y-2 text-xs">
                        <div className="flex gap-2 items-start">
                          <span className="bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded flex-shrink-0">무엇을</span>
                          <span className="text-gray-700"><span className="font-semibold">KODEX200타겟위클리커버드콜</span> 검색 후 매수. 월배당(연 약 12% 세후)이 자동으로 재투자되며 복리로 불어남</span>
                        </div>
                        <div className="flex gap-2 items-start">
                          <span className="bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded flex-shrink-0">언제</span>
                          <span className="text-gray-700">입금 후 바로 매수. 타이밍 재지 말 것 — <span className="font-semibold">지금이 항상 최선</span></span>
                        </div>
                        <div className="flex gap-2 items-start">
                          <span className="bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded flex-shrink-0">나중에</span>
                          <span className="text-gray-700">공부가 되면 KODEX200 ETF와 비중 나누기. 처음엔 하나만으로 충분</span>
                        </div>
                        <div className="bg-emerald-50 rounded-lg px-3 py-2 mt-1">
                          <p className="text-emerald-700">✔ 월배당이 자동 재입금되어 매달 조금씩 주식 수가 늘어남 → 시간이 갈수록 배당금도 커지는 구조</p>
                        </div>
                      </div>
                    </div>

                    {/* STEP 3 */}
                    <div className="rounded-xl border border-purple-200 overflow-hidden">
                      <div className="bg-purple-600 px-4 py-2 flex items-center gap-2">
                        <span className="bg-white text-purple-600 font-bold text-xs px-2 py-0.5 rounded-full">STEP 3</span>
                        <p className="text-white font-semibold text-sm">자동이체 설정 — 신경 끄기</p>
                      </div>
                      <div className="p-4 space-y-2 text-xs">
                        <div className="flex gap-2 items-start">
                          <span className="bg-purple-100 text-purple-700 font-bold px-1.5 py-0.5 rounded flex-shrink-0">방법</span>
                          <span className="text-gray-700">월급날 다음 날 연금저축 계좌로 <span className="font-semibold">자동이체 설정</span>. 통장에 있으면 쓰게 됨 — 먼저 빼두는 게 핵심</span>
                        </div>
                        <div className="flex gap-2 items-start">
                          <span className="bg-purple-100 text-purple-700 font-bold px-1.5 py-0.5 rounded flex-shrink-0">매수</span>
                          <span className="text-gray-700">입금 당일 또는 다음 날 ETF 매수 — <span className="font-semibold">매달 같은 날 자동 매수(정기매수)</span> 설정 가능한 증권사도 있음</span>
                        </div>
                        <div className="bg-purple-50 rounded-lg px-3 py-2 mt-1">
                          <p className="text-purple-700">✔ 자동화해두면 주가가 떨어져도 흔들리지 않고 꾸준히 적립 가능 — 감정 개입 차단이 핵심</p>
                        </div>
                      </div>
                    </div>

                    {/* STEP 4 */}
                    <div className="rounded-xl border border-indigo-200 overflow-hidden">
                      <div className="bg-indigo-600 px-4 py-2 flex items-center gap-2">
                        <span className="bg-white text-indigo-600 font-bold text-xs px-2 py-0.5 rounded-full">STEP 4</span>
                        <p className="text-white font-semibold text-sm">IRP 개설 — 연금저축 자리 잡으면</p>
                      </div>
                      <div className="p-4 space-y-2 text-xs">
                        <div className="flex gap-2 items-start">
                          <span className="bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.5 rounded flex-shrink-0">언제</span>
                          <span className="text-gray-700">연금저축 월 50만원이 부담 없이 유지될 때 추가 개설</span>
                        </div>
                        <div className="flex gap-2 items-start">
                          <span className="bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.5 rounded flex-shrink-0">얼마나</span>
                          <span className="text-gray-700">월 25만원 (연 300만원) → 세액공제 추가로 <span className="font-semibold">약 49만원 더 환급</span></span>
                        </div>
                        <div className="flex gap-2 items-start">
                          <span className="bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.5 rounded flex-shrink-0">주의</span>
                          <span className="text-gray-700">IRP는 중도인출이 사실상 불가 → <span className="font-semibold">생활비 6개월치 비상금 먼저 확보</span> 후 시작</span>
                        </div>
                        <div className="bg-indigo-50 rounded-lg px-3 py-2 mt-1">
                          <p className="text-indigo-700">✔ 연금저축 + IRP 합산 세액공제 최대 <span className="font-semibold">900만원</span> → 연간 최대 <span className="font-semibold">148만원 환급</span></p>
                        </div>
                      </div>
                    </div>

                    {/* STEP 5 */}
                    <div className="rounded-xl border border-orange-200 overflow-hidden">
                      <div className="bg-orange-500 px-4 py-2 flex items-center gap-2">
                        <span className="bg-white text-orange-500 font-bold text-xs px-2 py-0.5 rounded-full">STEP 5</span>
                        <p className="text-white font-semibold text-sm">연말정산 환급금 → 다시 투자</p>
                      </div>
                      <div className="p-4 space-y-2 text-xs">
                        <div className="flex gap-2 items-start">
                          <span className="bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded flex-shrink-0">매년 1~2월</span>
                          <span className="text-gray-700">연말정산으로 돌아온 환급금을 연금저축 또는 IRP에 <span className="font-semibold">추가 납입</span></span>
                        </div>
                        <div className="flex gap-2 items-start">
                          <span className="bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded flex-shrink-0">효과</span>
                          <span className="text-gray-700">환급금 99만원을 재투자하면 10년 후 약 <span className="font-semibold">310만원</span> (연 12% 복리 기준)</span>
                        </div>
                        <div className="bg-orange-50 rounded-lg px-3 py-2 mt-1">
                          <p className="text-orange-700">✔ 국가가 돌려준 돈으로 다시 투자 → 원금 부담 없이 눈덩이가 굴러감</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 핵심 숫자 */}
                  <div className="bg-gray-900 rounded-xl p-4 text-white">
                    <p className="font-semibold mb-3 text-sm">📊 알아두면 동기부여 되는 숫자</p>
                    <div className="space-y-2 text-xs">
                      {[
                        ["월 50만원 납입", "연말 환급 약 99만원 (총급여 5,500만원 이하 16.5%)"],
                        ["연금저축+IRP 900만원", "연간 최대 환급 148만원 — 정부가 매년 공짜로 주는 돈"],
                        ["월 20만원 × 20년 × 연 12%", "약 2억 (납입 원금 4,800만원의 4배)"],
                        ["월 50만원 × 10년 × 연 12%", "약 1억 1,600만원"],
                        ["퇴직 후 1억 보유 시 커버드콜 배당", "연 약 1,200만원 (월 100만원) — 연금 외 추가 현금흐름"],
                      ].map(([label, val]) => (
                        <div key={label} className="flex justify-between items-start gap-4 border-b border-gray-700 pb-1.5">
                          <span className="text-gray-300">{label}</span>
                          <span className="text-right font-semibold text-emerald-400 flex-shrink-0">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 하지 말아야 할 것 */}
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="font-semibold text-red-800 mb-2">🚫 절대 하지 말아야 할 것</p>
                    <div className="space-y-1.5 text-xs">
                      {[
                        ["연금저축·IRP 중도 해지", "세금 추징(기타소득세 16.5%) + 그동안의 복리 기회 날아감. 한 번 해지하면 다시 시작이 너무 아까움"],
                        ["주가 떨어진다고 매도", "하락장이 오히려 싸게 살 기회. 매달 자동이체 설정해두면 자연스럽게 평균 단가 낮아짐"],
                        ["완벽한 타이밍 기다리기", "'지금은 비싸니까 나중에' 하다 10년 지나가 있음. 지금 바로 시작이 항상 최선"],
                        ["이것저것 분산해서 복잡하게", "처음엔 커버드콜 ETF 하나만으로 충분. 복잡하면 관리 못하고 결국 포기하게 됨"],
                      ].map(([bad, reason]) => (
                        <div key={bad} className="bg-white rounded-lg px-3 py-2 border border-red-100">
                          <p className="font-semibold text-red-700 mb-0.5">✗ {bad}</p>
                          <p className="text-gray-600">{reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 직장인 체크리스트 */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="font-semibold text-blue-800 mb-2">✅ 직장인 오늘의 체크리스트</p>
                    <div className="space-y-1.5 text-xs text-blue-700">
                      {[
                        "증권사 앱 설치 완료",
                        "연금저축펀드 계좌 개설 완료",
                        "KODEX200타겟위클리커버드콜 ETF 매수 완료",
                        "월급날 다음 날 자동이체 설정 완료",
                        "회사 퇴직연금 DC형 여부 확인 (DC형이면 ETF로 변경)",
                        "비상금 6개월치 마련 후 IRP 개설 예정",
                      ].map((item, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <span className="w-4 h-4 rounded border-2 border-blue-300 flex-shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {section === "summary" && (
                <>
                  <p className="text-gray-700 leading-relaxed">
                    <span className="font-semibold text-blue-700">KODEX200 ETF</span>와{" "}
                    <span className="font-semibold text-emerald-700">KODEX200 타겟위클리커버드콜 ETF</span> 두 상품에
                    동일한 금액을 투자했을 때, 퇴직 시점의 예상 자산과 퇴직 후 월배당금을 연평균 수익률
                    시나리오(-20% ~ +20%)별로 비교하는 시뮬레이터입니다.
                  </p>

                  {/* 투자 흐름 타임라인 */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-500 mb-3">투자 흐름</p>
                    <svg viewBox="0 0 480 90" className="w-full">
                      {/* 배경 바 */}
                      <rect x="30" y="28" width="165" height="32" rx="6" fill="#dbeafe" />
                      <rect x="205" y="28" width="245" height="32" rx="6" fill="#dcfce7" />
                      {/* 텍스트 */}
                      <text x="113" y="43" textAnchor="middle" fontSize="11" fontWeight="600" fill="#1d4ed8">적립 기간</text>
                      <text x="113" y="55" textAnchor="middle" fontSize="9" fill="#3b82f6">매월 납입금 투자</text>
                      <text x="327" y="43" textAnchor="middle" fontSize="11" fontWeight="600" fill="#15803d">보관 기간</text>
                      <text x="327" y="55" textAnchor="middle" fontSize="9" fill="#22c55e">ETF 보유 · 복리 성장</text>
                      {/* 마커 */}
                      <circle cx="30" cy="44" r="5" fill="#6366f1" />
                      <circle cx="205" cy="44" r="5" fill="#6366f1" />
                      <circle cx="450" cy="44" r="6" fill="#f59e0b" />
                      <text x="30" y="78" textAnchor="middle" fontSize="9" fill="#6366f1">현재</text>
                      <text x="205" y="78" textAnchor="middle" fontSize="9" fill="#6366f1">적립 완료</text>
                      <text x="450" y="78" textAnchor="middle" fontSize="9" fontWeight="600" fill="#d97706">퇴직 시점</text>
                      {/* 퇴직 아이콘 */}
                      <text x="450" y="20" textAnchor="middle" fontSize="14">🏖</text>
                    </svg>
                  </div>

                  {/* 두 상품 비교 카드 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                      <p className="text-xs font-bold text-blue-800 mb-1">📈 KODEX200 ETF</p>
                      <ul className="space-y-1">
                        {["코스피200 지수 추종", "시세차익 중심 수익", "상승장에서 높은 수익", "배당 없음"].map(t => (
                          <li key={t} className="text-xs text-blue-700 flex gap-1"><span>·</span>{t}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                      <p className="text-xs font-bold text-emerald-800 mb-1">💰 KODEX200 타겟위클리커버드콜 ETF</p>
                      <ul className="space-y-1">
                        {["콜옵션 프리미엄으로 월배당", "연 약 15% 배당 (세후 12%)", "하락장 손실 일부 보전", "상승 수익은 제한적"].map(t => (
                          <li key={t} className="text-xs text-emerald-700 flex gap-1"><span>·</span>{t}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* 주요 기능 */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-xs font-semibold text-amber-800 mb-2">주요 기능</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ["🗂 탭 선택", "수익율 확인·IRP 등 계좌 유형별 시뮬레이션"],
                        ["✏️ 입력값 수정", "생년월일·납입금·연금수령나이 조정"],
                        ["💾 시뮬레이션 저장", "결과를 제목/메모와 함께 DB 저장"],
                        ["📂 저장 목록 불러오기", "과거 시뮬레이션 비교 · 기본값 복원"],
                      ].map(([title, desc]) => (
                        <div key={title} className="text-xs">
                          <p className="font-semibold text-amber-900">{title}</p>
                          <p className="text-amber-700">{desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {section === "detail" && (
                <>
                  {/* 섹션 1: 시뮬레이션 표 읽는 법 */}
                  <div>
                    <p className="font-semibold text-gray-800 mb-2">① 시뮬레이션 표 읽는 법</p>
                    <p className="text-xs text-gray-600 leading-relaxed mb-3">
                      표의 행은 <span className="font-medium">KODEX200의 연평균 수익률 시나리오</span> 6가지(-20%·-10%·0%·5%·10%·20%)를 나타냅니다.
                      각 시나리오에서 <span className="text-blue-600 font-medium">KODEX200 ETF</span>와 <span className="text-emerald-600 font-medium">KODEX200 타겟위클리커버드콜 ETF</span>의 평가금액과 수익률을 <span className="font-medium">적립 완료</span> 시점과 <span className="text-amber-600 font-medium">퇴직 시점</span> 두 기준으로 보여줍니다.
                    </p>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden text-xs">
                      <div className="grid grid-cols-5 bg-gray-200 text-gray-600 font-semibold text-center divide-x divide-gray-300">
                        <div className="py-2">수익률</div>
                        <div className="py-2 text-blue-700 col-span-2">KODEX200 ETF</div>
                        <div className="py-2 text-emerald-700 col-span-2">커버드콜 ETF</div>
                      </div>
                      <div className="grid grid-cols-5 text-gray-500 text-center divide-x divide-gray-200 bg-gray-100">
                        <div className="py-1"></div>
                        <div className="py-1">적립완료</div>
                        <div className="py-1 font-medium text-amber-700">퇴직시점 ★</div>
                        <div className="py-1">적립완료</div>
                        <div className="py-1 font-medium text-amber-700">퇴직시점 ★</div>
                      </div>
                      {[
                        ["-20%", "손실", "손실 확대", "손실 축소", "손실 축소"],
                        ["+10%", "수익", "복리로 큰 수익", "수익 (제한)", "수익 + 배당"],
                      ].map(([rate, ...vals]) => (
                        <div key={rate} className="grid grid-cols-5 text-center divide-x divide-gray-200 border-t border-gray-200">
                          <div className="py-2 font-bold text-gray-700">{rate}</div>
                          {vals.map((v, i) => (
                            <div key={i} className={`py-2 ${i === 1 || i === 3 ? "text-amber-700 font-medium" : "text-gray-600"}`}>{v}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">★ 퇴직 시점 = 적립 완료 후 연금 수령 나이까지 ETF를 계속 보유한 결과(월 배당금은 배당금 수령 시점까지 계속 재투자)</p>
                  </div>

                  {/* 섹션 2: 입력 값 */}
                  <div>
                    <p className="font-semibold text-gray-800 mb-2">② 입력 값 설명</p>
                    <div className="space-y-2">
                      {(([
                        ["생년월일", "현재 나이를 계산해 보관 기간 자동 산출에 사용"],
                        ["초기 입금", "투자 시작 시 한 번에 넣는 금액 (0원도 가능)"],
                        ["월 납입금", "적립 기간 동안 매월 자동이체하는 금액"],
                        ["적립 기간", "월 납입금을 투자하는 총 기간 (개월 단위)"],
                        ["연금 수령 나이", "커버드콜 ETF를 보유한 상태에서 배당금을 매월 수령하는 배당 개시 나이 (만 55~80세)"],
                        ["보관 기간", "적립 완료 후 배당금 수령 시까지 커버드콜 ETF를 그대로 보유하는 기간 (자동 계산)", ["월 배당금은 배당금 수령 시점까지 계속해서 자동 재투자(자동 매입 설정 기능 활용)"]],
                        ["커버드콜 배당률", "커버드콜 ETF의 연간 배당 수익률 (현재 15%, 세후 약 12%)", ["종합계좌 이용 시 배당소득세 15.4% 제외", "운용보수 및 기타 비용 제외 후 약 12% 재투자 가능"]],
                      ]) as [string, string, string[]?][]).map(([key, desc, subs]) => (
                        <div key={key} className="flex gap-3 text-xs">
                          <span className="font-semibold text-gray-700 w-32 flex-shrink-0">{key}</span>
                          <div className="text-gray-600">
                            <span>{desc}</span>
                            {subs && (
                              <ul className="mt-0.5 space-y-0.5">
                                {subs.map(s => (
                                  <li key={s} className="flex gap-1"><span>-</span><span>{s}</span></li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 섹션 3: 퇴직 후 배당금 */}
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                    <p className="font-semibold text-orange-900 mb-1">③ 퇴직 후 배당금 계산 방법</p>
                    <div className="text-xs text-orange-800 space-y-1">
                      <p>퇴직 시점 커버드콜 ETF 평가금액 × 커버드콜 배당률(연) = <span className="font-bold">연 배당금</span></p>
                      <p>연 배당금 ÷ 12 = <span className="font-bold">월 배당금</span></p>
                      <div className="mt-2 bg-white/60 rounded-lg px-3 py-2 font-mono text-orange-900">
                        <p>예) 평가금액 5,000만원 × 12% = <span className="font-bold text-orange-700">연 600만원</span></p>
                        <p className="text-orange-600">→ 월 50만원 수령</p>
                      </div>
                    </div>
                  </div>

                  {/* 섹션 4: 시뮬레이션 저장/불러오기 */}
                  <div>
                    <p className="font-semibold text-gray-800 mb-2">④ 시뮬레이션 저장 및 불러오기</p>
                    <div className="space-y-2.5">
                      {[
                        {
                          step: "1",
                          color: "bg-emerald-600",
                          title: "시뮬레이션 저장",
                          desc: "입력값을 변경하고 '시뮬레이션 저장' 버튼 클릭 → 제목과 메모를 입력하고 저장합니다.",
                        },
                        {
                          step: "2",
                          color: "bg-purple-600",
                          title: "저장 목록 선택",
                          desc: "저장된 시뮬레이션 목록에서 항목을 클릭하면 해당 시점의 결과가 표 아래에 표시되어 기존 내역과 비교 가능",
                        },
                        {
                          step: "3",
                          color: "bg-blue-600",
                          title: "기본값으로 저장",
                          desc: "선택한 저장 시뮬레이션의 입력값을 현재 탭의 활성 값으로 즉시 적용합니다.",
                        },
                      ].map(({ step, color, title, desc }) => (
                        <div key={step} className="flex gap-3 text-xs">
                          <span className={`${color} text-white w-5 h-5 rounded-full flex-shrink-0 inline-flex items-center justify-center font-bold text-[10px]`}>{step}</span>
                          <div>
                            <p className="font-semibold text-gray-800">{title}</p>
                            <p className="text-gray-600">{desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {section === "accounts" && (
                <div className="space-y-5">

                  {/* 상단 요약 배너 */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-600 leading-relaxed">
                    <p className="font-semibold text-gray-800 mb-1">💡 한눈에 보는 계좌 구조</p>
                    <p>연금저축·IRP는 <span className="font-semibold text-blue-700">내가 직접 개설</span>하는 노후 전용 절세 계좌이고,
                    퇴직연금(DB·DC)은 <span className="font-semibold text-orange-700">회사가 의무 설정</span>하는 퇴직금 제도입니다.
                    ISA는 <span className="font-semibold text-purple-700">중단기 자산 증식</span>에 특화된 비과세 계좌로, 만기 후 연금저축으로 이전하면 추가 세제 혜택을 받을 수 있습니다.</p>
                  </div>

                  {/* 연금저축펀드 */}
                  <div className="rounded-xl border border-blue-200 overflow-hidden">
                    <div className="bg-blue-600 px-4 py-2.5">
                      <p className="text-sm font-bold text-white">📘 연금저축펀드</p>
                      <p className="text-xs text-blue-100 mt-0.5">IRP보다 유연하고 투자 자유도가 높은 핵심 노후 계좌</p>
                    </div>
                    <div className="p-4 space-y-3 text-xs">
                      {/* 개설·운용 주체 */}
                      <div className="flex gap-2">
                        <div className="flex-1 bg-blue-50 rounded-lg px-3 py-2">
                          <p className="font-semibold text-blue-800 mb-0.5">개설</p>
                          <p className="text-blue-700">본인이 직접 → 증권사·운용사 앱 또는 방문</p>
                        </div>
                        <div className="flex-1 bg-blue-50 rounded-lg px-3 py-2">
                          <p className="font-semibold text-blue-800 mb-0.5">운용</p>
                          <p className="text-blue-700">본인이 자유롭게 (100% ETF·펀드 가능)</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ["주목적", "노후 연금 적립 + 세액공제"],
                          ["세액공제 한도", "연 600만원 (IRP 포함 시 900만원)"],
                          ["세액공제율", "총급여 5,500만원 초과 → 13.2%"],
                          ["납입 한도", "연 1,800만원 (IRP 포함)"],
                          ["수령 조건", "만 55세 이후 연금 수령"],
                          ["수령 세율", "연금소득세 3.3~5.5%"],
                          ["중도 인출", "세액공제 미수령 원금은 비과세 인출 가능"],
                          ["투자 제한", "없음 — ETF·펀드 100% 자유"],
                        ].map(([k, v]) => (
                          <div key={k} className="flex justify-between border-b border-gray-100 pb-1">
                            <span className="text-gray-500">{k}</span>
                            <span className="font-semibold text-gray-800 text-right ml-2">{v}</span>
                          </div>
                        ))}
                      </div>
                      <div className="bg-blue-50 rounded-lg px-3 py-2">
                        <p className="font-semibold text-blue-800 mb-1">이 시뮬레이션에서의 적용</p>
                        <ul className="space-y-0.5 text-blue-700">
                          <li className="flex gap-1"><span>·</span><span>납입액 100%를 KODEX200 또는 커버드콜 ETF에 투자</span></li>
                          <li className="flex gap-1"><span>·</span><span>배당금 전액 재투자 (월복리 적용)</span></li>
                          <li className="flex gap-1"><span>·</span><span>수익율 확인 탭에서 시뮬레이션</span></li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* IRP */}
                  <div className="rounded-xl border border-emerald-200 overflow-hidden">
                    <div className="bg-emerald-700 px-4 py-2.5">
                      <p className="text-sm font-bold text-white">📗 IRP (개인형 퇴직연금)</p>
                      <p className="text-xs text-emerald-100 mt-0.5">퇴직금 + 노후 적립을 하나로 묶는 절세 노후 계좌</p>
                    </div>
                    <div className="p-4 space-y-3 text-xs">
                      <div className="flex gap-2">
                        <div className="flex-1 bg-emerald-50 rounded-lg px-3 py-2">
                          <p className="font-semibold text-emerald-800 mb-0.5">개설</p>
                          <p className="text-emerald-700">본인이 직접 → 은행·증권사·보험사 앱 또는 방문</p>
                        </div>
                        <div className="flex-1 bg-emerald-50 rounded-lg px-3 py-2">
                          <p className="font-semibold text-emerald-800 mb-0.5">운용</p>
                          <p className="text-emerald-700">본인이 직접 (단, 위험자산 최대 70%)</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ["주목적", "퇴직금 수령 + 노후 자금 적립"],
                          ["세액공제 한도", "연 900만원 (연금저축 포함 합산)"],
                          ["세액공제율", "총급여 5,500만원 초과 → 13.2%"],
                          ["납입 한도", "연 1,800만원 (연금저축 포함)"],
                          ["수령 조건", "만 55세 이후 연금 수령"],
                          ["수령 세율", "연금소득세 3.3~5.5%"],
                          ["중도 인출", "사실상 불가 (사망·해외이주 등 예외만)"],
                          ["퇴직금 이전", "퇴직 시 퇴직금 자동 수령 가능"],
                        ].map(([k, v]) => (
                          <div key={k} className="flex justify-between border-b border-gray-100 pb-1">
                            <span className="text-gray-500">{k}</span>
                            <span className="font-semibold text-gray-800 text-right ml-2">{v}</span>
                          </div>
                        ))}
                      </div>
                      {/* 의무 투자 비율 */}
                      <div className="bg-emerald-50 rounded-lg px-3 py-2 space-y-1.5">
                        <p className="font-semibold text-emerald-800">의무 투자 비율</p>
                        <div className="flex gap-2">
                          <div className="flex-1 bg-emerald-100 border border-emerald-300 rounded-lg px-2 py-1.5 text-center">
                            <p className="font-bold text-emerald-800 text-sm">30%</p>
                            <p className="text-emerald-700">안전자산</p>
                            <p className="text-emerald-600 mt-0.5">채권 · 적금</p>
                            <p className="text-emerald-600">연복리 적용</p>
                          </div>
                          <div className="flex items-center text-emerald-400 font-bold">+</div>
                          <div className="flex-1 bg-blue-100 border border-blue-300 rounded-lg px-2 py-1.5 text-center">
                            <p className="font-bold text-blue-800 text-sm">70%</p>
                            <p className="text-blue-700">위험자산</p>
                            <p className="text-blue-600 mt-0.5">KODEX200</p>
                            <p className="text-blue-600">커버드콜 ETF</p>
                            <p className="text-blue-500 text-[10px]">월복리 적용</p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-emerald-50 rounded-lg px-3 py-2">
                        <p className="font-semibold text-emerald-800 mb-1">이 시뮬레이션에서의 적용</p>
                        <ul className="space-y-0.5 text-emerald-700">
                          <li className="flex gap-1"><span>·</span><span>납입액의 30%는 안전자산(연복리), 70%는 ETF(월복리)로 각각 계산 후 합산</span></li>
                          <li className="flex gap-1"><span>·</span><span>KODEX200 컬럼: 안전자산 30% + KODEX200 70%</span></li>
                          <li className="flex gap-1"><span>·</span><span>커버드콜 컬럼: 안전자산 30% + 커버드콜 ETF 70%</span></li>
                          <li className="flex gap-1"><span>·</span><span>배당금은 커버드콜 70% 부분에서만 산출</span></li>
                          <li className="flex gap-1"><span>·</span><span>IRP 수익율 확인 탭에서 시뮬레이션</span></li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* ISA */}
                  <div className="rounded-xl border border-purple-200 overflow-hidden">
                    <div className="bg-purple-600 px-4 py-2.5">
                      <p className="text-sm font-bold text-white">📒 ISA (개인종합자산관리계좌)</p>
                      <p className="text-xs text-purple-100 mt-0.5">3년 단위로 굴리는 중단기 절세 계좌 — 만기 후 연금 이전 시 추가 혜택</p>
                    </div>
                    <div className="p-4 space-y-3 text-xs">
                      <div className="flex gap-2">
                        <div className="flex-1 bg-purple-50 rounded-lg px-3 py-2">
                          <p className="font-semibold text-purple-800 mb-0.5">개설</p>
                          <p className="text-purple-700">본인이 직접 → 은행·증권사 앱 (1인 1계좌)</p>
                        </div>
                        <div className="flex-1 bg-purple-50 rounded-lg px-3 py-2">
                          <p className="font-semibold text-purple-800 mb-0.5">운용</p>
                          <p className="text-purple-700">본인이 자유롭게 — 펀드·ETF·예금·RP 등</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ["주목적", "중단기 자산 증식 + 절세"],
                          ["세액공제", "없음"],
                          ["비과세 한도", "일반형 200만원 / 서민형 400만원"],
                          ["초과 수익 과세", "9.9% 분리과세"],
                          ["금융소득종합과세", "해당 없음"],
                          ["의무 유지 기간", "3년"],
                          ["납입 한도", "연 2,000만원 (미납분 이월 가능)"],
                          ["중도 인출", "납입 원금 범위 내 자유 인출 가능"],
                        ].map(([k, v]) => (
                          <div key={k} className="flex justify-between border-b border-gray-100 pb-1">
                            <span className="text-gray-500">{k}</span>
                            <span className="font-semibold text-gray-800 text-right ml-2">{v}</span>
                          </div>
                        ))}
                      </div>
                      <div className="bg-purple-50 rounded-lg px-3 py-2 border border-purple-200">
                        <p className="font-semibold text-purple-800 mb-1">⭐ 만기 후 연금저축 이전 시 추가 혜택</p>
                        <ul className="space-y-0.5 text-purple-700">
                          <li className="flex gap-1"><span>·</span><span>만기 후 60일 이내 연금저축 계좌로 이전 가능</span></li>
                          <li className="flex gap-1"><span>·</span><span>이전 금액의 10% 추가 세액공제 (최대 300만원)</span></li>
                          <li className="flex gap-1"><span>·</span><span>ISA 비과세 혜택 + 연금저축 세액공제까지 이중 혜택</span></li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* 퇴직연금 DB/DC */}
                  <div className="rounded-xl border border-amber-200 overflow-hidden">
                    <div className="bg-amber-600 px-4 py-2.5">
                      <p className="text-sm font-bold text-white">🏢 퇴직연금 (DB형 / DC형)</p>
                      <p className="text-xs text-amber-100 mt-0.5">회사가 의무적으로 운영하는 퇴직금 제도 — 본인이 선택하는 계좌가 아님</p>
                    </div>
                    <div className="p-4 space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-3">
                        {/* DB형 */}
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <p className="font-bold text-amber-800 mb-2">DB형 (확정급여형)</p>
                          <div className="space-y-1.5">
                            {[
                              ["개설·운용", "회사가 설정·운용"],
                              ["주목적", "회사가 퇴직금 보장"],
                              ["투자 자유도", "없음 — 회사가 전담"],
                              ["퇴직금 기준", "마지막 평균급여 기준"],
                              ["중간정산", "제한적"],
                            ].map(([k, v]) => (
                              <div key={k} className="flex justify-between border-b border-amber-100 pb-1">
                                <span className="text-gray-500">{k}</span>
                                <span className="font-semibold text-gray-800 text-right ml-1">{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* DC형 */}
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                          <p className="font-bold text-orange-800 mb-2">DC형 (확정기여형)</p>
                          <div className="space-y-1.5">
                            {[
                              ["개설", "회사가 설정"],
                              ["운용", "본인이 직접"],
                              ["투자 자유도", "펀드·ETF 선택 가능"],
                              ["퇴직금 기준", "운용 성과에 따라 달라짐"],
                              ["중간정산", "제한적"],
                            ].map(([k, v]) => (
                              <div key={k} className="flex justify-between border-b border-orange-100 pb-1">
                                <span className="text-gray-500">{k}</span>
                                <span className="font-semibold text-gray-800 text-right ml-1">{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="bg-amber-50 rounded-lg px-3 py-2">
                        <p className="font-semibold text-amber-800 mb-1">공통 사항</p>
                        <ul className="space-y-0.5 text-amber-700">
                          <li className="flex gap-1"><span>·</span><span>퇴직 시 IRP 계좌로 이전 가능 — 계속 운용하면 세금 이연</span></li>
                          <li className="flex gap-1"><span>·</span><span>DC형이라면 ETF·펀드 직접 선택 가능 → IRP 수익율 탭과 동일한 전략 적용 검토</span></li>
                          <li className="flex gap-1"><span>·</span><span>DB·DC 선택은 회사 규정에 따름 (근로자가 임의 변경 불가)</span></li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* 계좌 선택 가이드 */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="font-semibold text-gray-800 mb-3">📋 계좌 선택 가이드</p>
                    <div className="space-y-2 text-xs text-gray-700">
                      <div className="flex gap-2 items-start">
                        <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 mt-0.5">연금저축</span>
                        <span>세액공제 혜택 + 투자 제한 없음 + 중도 인출 일부 가능 — <span className="font-semibold">ETF 적극 투자 선호 시 먼저 채울 것</span></span>
                      </div>
                      <div className="flex gap-2 items-start">
                        <span className="bg-emerald-700 text-white px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 mt-0.5">IRP</span>
                        <span>연금저축 세액공제 한도(600만원) 채운 후 추가로 300만원 더 공제 가능 → <span className="font-semibold">합산 최대 900만원</span> / 퇴직금 수령 창구로도 활용</span>
                      </div>
                      <div className="flex gap-2 items-start">
                        <span className="bg-purple-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 mt-0.5">ISA</span>
                        <span>세액공제는 없지만 비과세·분리과세로 절세 — 3년 만기 후 연금저축 이전 시 <span className="font-semibold">추가 세액공제(최대 300만원) 이중 혜택</span></span>
                      </div>
                      <div className="flex gap-2 items-start">
                        <span className="bg-amber-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 mt-0.5">DC형</span>
                        <span>회사 의무 제도이지만 <span className="font-semibold">본인이 ETF·펀드 선택 가능</span> — 적극적으로 운용하면 퇴직금을 직접 불릴 수 있음</span>
                      </div>
                    </div>
                  </div>

                  {/* 상황별 유리한 계좌 */}
                  <div className="rounded-xl border border-indigo-200 overflow-hidden">
                    <div className="bg-indigo-700 px-4 py-2.5">
                      <p className="text-sm font-bold text-white">🎯 상황별 유리한 계좌 전략</p>
                      <p className="text-xs text-indigo-100 mt-0.5">내 상황에 맞는 계좌 조합을 확인하세요</p>
                    </div>
                    <div className="p-4 space-y-4 text-xs">

                      {/* 직업별 */}
                      <div>
                        <p className="font-semibold text-gray-800 mb-2 flex items-center gap-1">👤 직업·고용 형태별</p>
                        <div className="space-y-2">
                          {[
                            {
                              tag: "직장인",
                              tagColor: "bg-blue-600",
                              title: "퇴직연금(DB/DC) + 연금저축 + IRP",
                              items: [
                                "DC형이면 ETF·펀드 직접 운용 → 퇴직금도 직접 불릴 수 있음",
                                "연금저축 600만원 + IRP 300만원 = 세액공제 최대 900만원",
                                "ISA 병행 시 3년마다 비과세 절세 + 연금 이전 추가 혜택",
                              ],
                            },
                            {
                              tag: "자영업자·프리랜서",
                              tagColor: "bg-purple-600",
                              title: "연금저축 + IRP (퇴직연금 없으므로 직접 적립 필수)",
                              items: [
                                "회사 퇴직연금이 없어 스스로 노후 준비가 더 중요",
                                "연금저축(600만원) 먼저 채우고, 여유 자금은 IRP(300만원) 추가",
                                "단기 자금 여유가 있으면 ISA로 중단기 절세 병행",
                              ],
                            },
                          ].map(({ tag, tagColor, title, items }) => (
                            <div key={tag} className="bg-gray-50 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className={`${tagColor} text-white px-1.5 py-0.5 rounded text-[10px] font-bold`}>{tag}</span>
                                <span className="font-semibold text-gray-800">{title}</span>
                              </div>
                              <ul className="space-y-0.5 text-gray-600">
                                {items.map((item) => (
                                  <li key={item} className="flex gap-1"><span>·</span><span>{item}</span></li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 시기별 */}
                      <div>
                        <p className="font-semibold text-gray-800 mb-2 flex items-center gap-1">📅 연령·시기별</p>
                        <div className="space-y-2">
                          {[
                            {
                              tag: "20~30대 적립 초기",
                              tagColor: "bg-teal-600",
                              items: [
                                "적립 기간이 길수록 복리 효과 극대화 → 일찍 시작할수록 유리",
                                "연금저축부터 개설 후 매월 소액이라도 꾸준히 납입",
                                "ISA 동시 운용 시 3년 단위로 비과세 혜택을 쌓으면서 연금 전환",
                                "이 시기에는 KODEX200 비중을 높여 시세차익 위주 전략이 유리",
                              ],
                            },
                            {
                              tag: "40대 적립 중기",
                              tagColor: "bg-blue-600",
                              items: [
                                "세액공제 한도 900만원 최대한 활용 (연금저축 600 + IRP 300)",
                                "ISA 3년 만기 사이클을 연금저축 이전과 맞추면 추가 세액공제 확보",
                                "커버드콜 ETF 비중 점진적으로 늘려 안정적 배당 흐름 준비",
                              ],
                            },
                            {
                              tag: "50대 퇴직 준비",
                              tagColor: "bg-orange-600",
                              items: [
                                "만 55세 이후 연금 수령 가능 → 수령 시작 시점 미리 계획",
                                "커버드콜 ETF로 전환해 월배당 흐름을 먼저 체감해볼 것",
                                "퇴직 전 DC형 운용 전략을 안전자산 비중 높이는 방향으로 조정",
                                "IRP 중도인출은 사실상 불가 — 생활 여유자금은 ISA·CMA에 별도 보유",
                              ],
                            },
                          ].map(({ tag, tagColor, items }) => (
                            <div key={tag} className="bg-gray-50 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className={`${tagColor} text-white px-1.5 py-0.5 rounded text-[10px] font-bold`}>{tag}</span>
                              </div>
                              <ul className="space-y-0.5 text-gray-600">
                                {items.map((item) => (
                                  <li key={item} className="flex gap-1"><span>·</span><span>{item}</span></li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 연금 수령·배당 시점 */}
                      <div>
                        <p className="font-semibold text-gray-800 mb-2 flex items-center gap-1">💰 연금 수령 · 배당 시점별</p>
                        <div className="space-y-2">
                          {[
                            {
                              tag: "적립 기간 중",
                              tagColor: "bg-gray-600",
                              items: [
                                "배당금 전액 재투자 → 복리 효과로 원금보다 배당이 커지는 구간 도달",
                                "커버드콜 ETF는 월배당이 자동 재투자되며 잔고가 빠르게 불어남",
                              ],
                            },
                            {
                              tag: "퇴직 후 연금 수령 시작",
                              tagColor: "bg-emerald-700",
                              items: [
                                "연금저축·IRP 모두 연금소득세 3.3~5.5% — 일반 배당세(15.4%)보다 훨씬 낮음",
                                "수령 기간이 길수록(10년 이상) 세율이 낮아지므로 분할 수령이 유리",
                                "커버드콜 ETF 보유 시 월배당이 생활비로 바로 연결 — 연금+배당 이중 현금흐름 가능",
                                "연금 수령 첫 해부터 전체를 꺼내지 말고, 필요 금액만 인출하며 나머지는 계속 운용",
                              ],
                            },
                            {
                              tag: "중도 자금이 필요한 경우",
                              tagColor: "bg-red-600",
                              items: [
                                "IRP — 사실상 인출 불가 (응급 시에만 가능, 세금 추징 발생)",
                                "연금저축 — 세액공제 받지 않은 원금은 언제든 비과세로 인출 가능",
                                "ISA — 납입 원금 범위 내 언제든 자유 인출 가능 (가장 유연)",
                                "→ 비상금은 반드시 ISA·CMA에 별도로 마련해 둘 것",
                              ],
                            },
                          ].map(({ tag, tagColor, items }) => (
                            <div key={tag} className="bg-gray-50 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className={`${tagColor} text-white px-1.5 py-0.5 rounded text-[10px] font-bold`}>{tag}</span>
                              </div>
                              <ul className="space-y-0.5 text-gray-600">
                                {items.map((item) => (
                                  <li key={item} className="flex gap-1"><span>·</span><span>{item}</span></li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 절세 극대화 순서 */}
                      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                        <p className="font-semibold text-indigo-800 mb-2">✅ 절세 극대화 납입 순서 (추천)</p>
                        <div className="space-y-1.5 text-gray-700">
                          {[
                            ["①", "bg-blue-600", "연금저축 월 50만원", "연간 600만원 납입 → 세액공제 최대 99만원 (16.5% 기준) / 79만원 (13.2% 기준)"],
                            ["②", "bg-emerald-700", "IRP 월 25만원", "연간 300만원 추가 납입 → 세액공제 추가 최대 49.5만원"],
                            ["③", "bg-purple-600", "ISA 월 50만원 이하", "3년 후 만기 → 연금저축 이전 시 추가 세액공제 최대 30만원"],
                            ["④", "bg-amber-600", "DC형 적극 운용", "어차피 납입되는 퇴직금 — ETF 선택으로 수익률 높이기"],
                          ].map(([step, color, title, desc]) => (
                            <div key={title as string} className="flex gap-2 items-start">
                              <span className={`${color} text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5`}>{step}</span>
                              <div>
                                <span className="font-semibold text-gray-800">{title as string}</span>
                                <span className="text-gray-500 ml-1">— {desc as string}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  </div>

                </div>
              )}

              {section === "criteria" && (
                <div className="space-y-4">

                  {/* ETF 기본 정보 */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="font-semibold text-gray-900 mb-3">📌 투자 ETF : KODEX200 타겟위클리커버드콜 ETF</p>
                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                      {[
                        ["연 배당률", "15%"],
                        ["연 보수", "0.39%"],
                        ["세후 실질 배당(보수 공제)", "약 12%"],
                        ["배당 주기", "월배당"],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between border-b border-gray-200 pb-1">
                          <span className="text-gray-500">{k}</span>
                          <span className="font-semibold text-gray-800">{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* 계좌 유형별 세금 */}
                    <p className="text-xs font-semibold text-gray-700 mb-1.5">계좌 유형별 배당소득세</p>
                    <div className="space-y-1.5">
                      {[
                        { acct: "종합계좌 (CMA)", color: "bg-red-50 border-red-200 text-red-800", desc: "배당금 지급 시 증권사가 15.4% 사전 공제" },
                        { acct: "연금저축 계좌", color: "bg-blue-50 border-blue-200 text-blue-800", desc: "배당소득세 이연 → 퇴직 시점에 5.5% 이하로 납부" },
                        { acct: "개인형 IRP", color: "bg-emerald-50 border-emerald-200 text-emerald-800", desc: "배당소득세 이연 → 수령 시 연금소득세 3.3~5.5% / 납입 시 세액공제 13.2~16.5%" },
                        { acct: "ISA 계좌", color: "bg-purple-50 border-purple-200 text-purple-800", desc: "연 200만원(서민형 400만원)까지 비과세 / 초과분 9.9% 분리과세" },
                      ].map(({ acct, color, desc }) => (
                        <div key={acct} className={`text-xs rounded-lg border px-3 py-1.5 ${color}`}>
                          <span className="font-semibold">{acct}</span>
                          <span className="mx-1">—</span>
                          <span>{desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 투자 조건 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs">
                      <p className="font-semibold text-blue-900 mb-1">💰 월 투자 금액</p>
                      <p className="text-blue-700">20만원 ~ 50만원이 적당</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs">
                      <p className="font-semibold text-blue-900 mb-1">⏱ 목표 투자 기간</p>
                      <p className="text-blue-700">120개월(10년) / 180개월(15년)</p>
                    </div>
                  </div>

                  {/* 배당금 재투자 전략 */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs">
                    <p className="font-semibold text-amber-900 mb-2">🔄 배당금 재투자 전략</p>
                    <ul className="space-y-1 text-amber-800">
                      <li className="flex gap-1"><span>·</span><span>배당금 기준: 세금 공제 후 보수적으로 연 <strong>12%</strong> 적용</span></li>
                      <li className="flex gap-1"><span>·</span><span>10년/15년까지 배당금 <strong>전액 자동 재투자</strong> (자동 매수 기능 설정)</span></li>
                      <li className="flex gap-1"><span>·</span><span>목표 기간 이후에도 가능하면 재투자 유지 권장</span></li>
                    </ul>
                  </div>

                  {/* 장점 */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <p className="font-semibold text-emerald-900 mb-2">✅ 장점</p>
                    <ul className="space-y-1.5 text-xs text-emerald-800">
                      <li className="flex gap-1"><span>1.</span><span>소액을 장기간 적립하여 목돈 마련 가능</span></li>
                      <li className="flex gap-1"><span>2.</span><span>대규모 인플레이션으로 한국이 파산하는 극단적 경우를 제외하면 수익 구조 안정적</span></li>
                      <li className="flex gap-1"><span>3.</span><span>2~3년의 장기 시장 폭락·침체 상황도 배당 재투자로 대응 가능</span></li>
                      <li className="flex gap-1"><span>4.</span>
                        <div>
                          <span>10년/15년 후 배당금만으로 기본 생활비 확보 가능</span>
                          <div className="mt-1 bg-white/70 rounded-lg px-2 py-1 font-mono space-y-0.5">
                            <p className="text-emerald-700">KODEX200 연 10% 상승 가정 시:</p>
                            <p>· 10년 후 — 8,322만원 × 12% ÷ 12 = <strong>월 약 83만원</strong></p>
                            <p>· 15년 후 — 24,238만원 × 12% ÷ 12 = <strong>월 약 242만원</strong></p>
                          </div>
                        </div>
                      </li>
                      <li className="flex gap-1"><span>5.</span><span>배당금 수령 이후에도 <strong>원금은 그대로 유지</strong> 가능</span></li>
                    </ul>
                  </div>

                  {/* 단점 */}
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="font-semibold text-red-900 mb-2">⚠️ 단점 및 고려 사항</p>
                    <ul className="space-y-1 text-xs text-red-800">
                      <li className="flex gap-1"><span>1.</span><span>목표 시점에 KODEX200이 하락장일 경우 1~2년 추가 대기 필요</span></li>
                      <li className="flex gap-1"><span>2.</span><span>자녀 계좌의 경우 금액이 커지면 자녀가 임의 해지할 가능성 존재</span></li>
                      <li className="flex gap-1"><span>3.</span><span>매월 납입을 10년~15년 이상 유지할 수 있는지 여부 사전 점검 필요</span></li>
                    </ul>
                  </div>

                  {/* 현 시점 판단 */}
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs">
                    <p className="font-semibold text-indigo-900 mb-1">💡 현 시점 판단</p>
                    <p className="text-indigo-800">장기 유지할수록 복리 효과로 수익이 기하급수적으로 증가합니다. 빠른 시작과 꾸준한 납입이 핵심입니다.</p>
                  </div>

                </div>
              )}
            </div>

            {/* 하단 닫기 */}
            <div className="px-6 py-3 border-t border-gray-100 flex-shrink-0 flex justify-end">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// ─── 시뮬레이션 테이블 컴포넌트 ──────────────────────────────────────────────

function SimTable({
  rows,
  accumMonths,
  holdMonths,
  muted = false,
}: {
  rows: ComputedRow[]
  accumMonths: number
  holdMonths: number
  muted?: boolean
}) {
  const p1 = `적립 완료 (${fmtMonths(accumMonths)})`
  const p2 = `퇴직 시점 (${fmtMonths(accumMonths + holdMonths)})`
  const bg = muted ? "bg-gray-50" : "bg-white"

  return (
    <div className={`${bg} rounded-xl border border-gray-200 overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-center [&_tbody_td]:text-sm [&_tbody_td]:font-medium [&_tbody_td]:text-right">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-200">
              <th rowSpan={3} className="px-3 py-2 text-left text-gray-600 font-medium border-r border-gray-200 whitespace-nowrap">
                <>KODEX200<br />연평균 상승률</>
              </th>
              <th colSpan={4} className="px-3 py-2 text-blue-700 font-semibold border-r border-gray-200">
                <>KODEX200 ETF<HelpPopover
                  title="KODEX 200 ETF (티커: 069500)"
                  desc="운용사: 삼성자산운용 | 코스피200 지수 추종 인덱스 ETF"
                  composition={["삼성전자 (22.81%)", "SK하이닉스 (14.86%)", "KODEX200 (17.09%) 등 대형 우량주 위주 구성", "코스피 상위 200개 종목 분산 투자", "운용보수 연 0.15% (저비용)"]}
                  pros={["코스피200 지수와 동일한 성과 — 시장 성장 그대로 수혜", "낮은 운용보수(0.15%)로 장기 보유에 유리", "국내 최대 규모 ETF — 유동성 풍부", "상승장에서 높은 시세차익 기대"]}
                  cons={["하락장 손실 그대로 반영 (지수 방어 기능 없음)", "배당금 거의 없어 퇴직 후 현금흐름 확보 어려움", "시장 전체 위험에 고스란히 노출"]}
                  href="https://www.samsungfund.com/etf/product/view.do?id=2ETF01"
                /></>
              </th>
              <th colSpan={4} className="px-3 py-2 text-emerald-700 font-semibold border-r border-gray-200">
                <>커버드콜 ETF<HelpPopover
                  title="KODEX 200 타겟위클리커버드콜 ETF"
                  desc="운용사: 삼성자산운용 | 월배당 커버드콜 ETF"
                  composition={["기초자산: KODEX200 ETF", "전략: 매주 콜옵션 매도(위클리 커버드콜)", "월배당 지급 — 연 약 15% (세후 약 12%)"]}
                  pros={["안정적인 월배당 수익 (연 약 15%)", "하락장에서 프리미엄으로 손실 일부 보전", "은퇴 후 고정 현금흐름(월수입) 확보에 최적", "위클리 옵션 매도로 배당 안정성 강화"]}
                  cons={["주가 상승 시 시세차익이 콜옵션 행사가에 제한됨", "강세장에서 KODEX200 ETF 대비 수익 낮음", "배당소득세 15.4% 부담 (종합계좌 기준)", "인덱스 ETF보다 운용보수가 높음"]}
                  href="https://www.samsungfund.com/etf/product/view.do?id=2ETFP4"
                /></>
              </th>
              <th colSpan={4} className="px-3 py-2 text-purple-700 font-semibold border-r border-gray-200">
                차액 (커버드콜 ETF − KODEX200 ETF)
              </th>
              <th colSpan={2} className="px-3 py-2 text-orange-700 font-semibold">퇴직 후 배당금</th>
            </tr>
            <tr className="bg-gray-100 border-b border-gray-100 text-gray-500">
              <th colSpan={2} className="px-2 py-1 border-r border-gray-100 whitespace-nowrap">{p1}</th>
              <th colSpan={2} className="px-2 py-1 border-r border-gray-200 whitespace-nowrap">{p2}</th>
              <th colSpan={2} className="px-2 py-1 border-r border-gray-100 whitespace-nowrap">{p1}</th>
              <th colSpan={2} className="px-2 py-1 border-r border-gray-200 whitespace-nowrap">{p2}</th>
              <th colSpan={2} className="px-2 py-1 border-r border-gray-100 whitespace-nowrap">{p1}</th>
              <th colSpan={2} className="px-2 py-1 border-r border-gray-200 whitespace-nowrap">{p2}</th>
              <th colSpan={2} className="px-2 py-1 whitespace-nowrap">{p2}</th>
            </tr>
            <tr className="bg-gray-100 border-b border-gray-200 text-gray-400">
              {Array.from({ length: 6 }).map((_, gi) => (
                <Fragment key={gi}>
                  <th className="px-2 py-1 border-r border-gray-100">평가금액(만)</th>
                  <th className={`px-2 py-1 ${gi % 2 === 1 ? "border-r border-gray-200" : "border-r border-gray-100"}`}>수익율</th>
                </Fragment>
              ))}
              <th className="px-2 py-1 border-r border-gray-100 whitespace-nowrap">1년(만)</th>
              <th className="px-2 py-1 whitespace-nowrap">1개월(만)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.rate} className={`border-b border-gray-100 ${i % 2 === 0 ? (muted ? "bg-gray-50" : "bg-white") : "bg-gray-50/50"}`}>
                <td className="px-3 py-2.5 font-semibold text-gray-700 border-r border-gray-200 text-left">{row.rate}</td>
                <td className="px-2 py-2.5 text-gray-800 border-r border-gray-100">{row.kodex[0]}</td>
                <td className={`px-2 py-2.5 border-r border-gray-100 ${rateColor(row.kodex[1])}`}>{row.kodex[1]}</td>
                <td className="px-2 py-2.5 text-gray-800 border-r border-gray-100">{row.kodex[2]}</td>
                <td className={`px-2 py-2.5 border-r border-gray-200 ${rateColor(row.kodex[3])}`}>{row.kodex[3]}</td>
                <td className="px-2 py-2.5 text-gray-800 border-r border-gray-100">{row.covered[0]}</td>
                <td className={`px-2 py-2.5 border-r border-gray-100 ${rateColor(row.covered[1])}`}>{row.covered[1]}</td>
                <td className="px-2 py-2.5 text-gray-800 border-r border-gray-100">{row.covered[2]}</td>
                <td className={`px-2 py-2.5 border-r border-gray-200 ${rateColor(row.covered[3])}`}>{row.covered[3]}</td>
                <td className="px-2 py-2.5 text-gray-800 border-r border-gray-100">{row.diff[0]}</td>
                <td className={`px-2 py-2.5 border-r border-gray-100 ${rateColor(row.diff[1])}`}>{row.diff[1]}</td>
                <td className="px-2 py-2.5 text-gray-800 border-r border-gray-100">{row.diff[2]}</td>
                <td className={`px-2 py-2.5 border-r border-gray-200 ${rateColor(row.diff[3])}`}>{row.diff[3]}</td>
                <td className="px-2 py-2.5 text-orange-700 font-semibold border-r border-gray-100">{row.dividend?.[0] ?? "—"}</td>
                <td className="px-2 py-2.5 text-orange-700 font-semibold">{row.dividend?.[1] ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── 결과 요약 컴포넌트 ──────────────────────────────────────────────────────

function SimSummary({
  rows,
  inp,
  muted = false,
}: {
  rows: ComputedRow[]
  inp: InputValues
  muted?: boolean
}) {
  const totalW = Math.round((inp.initDeposit + inp.monthlyPmt * inp.accumMonths) / 10000)

  const SCENARIOS = [
    {
      label: "보수",
      sublabel: "KODEX200 0%",
      idx: 2,
      card: "bg-white border-gray-200",
      badge: "bg-gray-100 text-gray-600",
      label2: "text-gray-500",
      val: "text-gray-800",
      divBox: "bg-gray-100",
      divText: "text-gray-800",
    },
    {
      label: "중립",
      sublabel: "KODEX200 5%",
      idx: 3,
      card: "bg-blue-50 border-blue-200",
      badge: "bg-blue-100 text-blue-700",
      label2: "text-blue-500",
      val: "text-blue-800",
      divBox: "bg-blue-100",
      divText: "text-blue-900",
    },
    {
      label: "기대",
      sublabel: "KODEX200 10%",
      idx: 4,
      card: "bg-emerald-50 border-emerald-200",
      badge: "bg-emerald-100 text-emerald-700",
      label2: "text-emerald-600",
      val: "text-emerald-800",
      divBox: "bg-emerald-100",
      divText: "text-emerald-900",
    },
  ]

  const wrap = muted
    ? "bg-purple-50 border-purple-200"
    : "bg-amber-50 border-amber-200"
  const headText = muted ? "text-purple-900" : "text-amber-900"
  const subText  = muted ? "text-purple-600" : "text-amber-600"

  return (
    <div className={`rounded-xl border px-4 py-4 space-y-3 ${wrap}`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-1">
        <span className={`text-sm font-bold ${headText}`}>
          📊 시뮬레이션 결과 요약
          <span className={`ml-2 text-xs font-normal ${subText}`}>커버드콜 ETF 기준</span>
        </span>
        <span className={`text-xs ${subText}`}>
          총 납입원금 <span className="font-bold">{totalW.toLocaleString("ko-KR")}만원</span>
        </span>
      </div>

      {/* 시나리오 카드 */}
      <div className="grid grid-cols-3 gap-2">
        {SCENARIOS.map(({ label, sublabel, idx, card, badge, label2, val, divBox, divText }) => {
          const row = rows[idx]
          if (!row) return null
          return (
            <div key={idx} className={`rounded-xl border p-3 space-y-2.5 ${card}`}>
              {/* 시나리오 레이블 */}
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge}`}>{label}</span>
                <span className={`text-xs ${label2}`}>{sublabel}</span>
              </div>

              {/* 적립 완료 */}
              <div>
                <p className={`text-[10px] font-medium ${label2} mb-0.5`}>적립 완료</p>
                <p className={`text-sm font-bold ${val}`}>{row.covered[0]}만원</p>
                <p className={`text-xs ${rateColor(row.covered[1])}`}>{row.covered[1]}</p>
              </div>

              {/* 퇴직 시점 */}
              <div>
                <p className={`text-[10px] font-medium ${label2} mb-0.5`}>퇴직 시점 (만 {inp.retirementAge ?? 55}세)</p>
                <p className={`text-sm font-bold ${val}`}>{row.covered[2]}만원</p>
                <p className={`text-xs ${rateColor(row.covered[3])}`}>{row.covered[3]}</p>
              </div>

              {/* 월 배당금 강조 */}
              <div className={`rounded-lg px-3 py-2 ${divBox}`}>
                <p className={`text-[10px] font-semibold ${divText} mb-0.5`}>퇴직 후 월 배당금</p>
                <p className={`text-base font-extrabold ${divText}`}>{row.dividend[1]}만원<span className="text-xs font-semibold ml-0.5">/ 월</span></p>
                <p className={`text-[10px] ${divText} opacity-70`}>연 {row.dividend[0]}만원</p>
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

export default function SavingsFundPage() {
  const { data: session, status } = useSession()
  const role = status === "authenticated"
    ? ((session?.user as { role?: string })?.role ?? "admin")
    : null

  const isLoggedIn = status === "authenticated"

  const visibleTabs = TABS

  const [activeId, setActiveId]     = useState(TABS[0].id)
  const [inputs, setInputs]         = useState<Record<string, InputValues>>(
    Object.fromEntries(
      TABS.filter((t) => t.defaultInputs != null).map((t) => {
        const d = t.defaultInputs!
        const ageMonths = birthdateToAgeMonths(d.birthdate)
        const holdMonths = ageMonths != null
          ? calcHoldMonths(d.retirementAge ?? 55, d.accumMonths, ageMonths)
          : d.holdMonths
        return [t.id, { ...d, holdMonths }]
      })
    )
  )
  const [editDraft, setEditDraft]     = useState<InputValues | null>(null)
  const [savedList, setSavedList]     = useState<SavedSim[]>([])
  const [selectedSim, setSelectedSim] = useState<SavedSim | null>(null)
  const [saving, setSaving]           = useState(false)
  const [saveMsg, setSaveMsg]         = useState<string | null>(null)
  const [loading, setLoading]         = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveDraft, setSaveDraft]     = useState({ title: "", memo: "" })
  const [ipBlocked, setIpBlocked]     = useState(false)

  // role이 결정되면 첫 번째 visible 탭으로 맞춤
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.find((t) => t.id === activeId)) {
      setActiveId(visibleTabs[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  // 비로그인 사용자 IP 사용량 체크 (페이지 로드 1회)
  useEffect(() => {
    if (status === "unauthenticated") {
      checkAndRecordIpUsage()
        .then(({ allowed }) => { if (!allowed) setIpBlocked(true) })
        .catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const tab         = TABS.find((t) => t.id === activeId)!
  const isKodex200Tab = tab?.isKodex200 ?? false
  const curInput    = inputs[activeId] ?? inputs[TABS[0].id]
  const isIRP       = tab?.isIRP ?? false
  const rows        = isKodex200Tab ? [] : isIRP ? calculateIRPRows(curInput) : calculateRows(curInput)

  // IRP 안전자산 (30%) 미래 가치
  const safeAnnualRate  = curInput.safeRate ?? 0.05
  const rSafeMonthly    = Math.pow(1 + safeAnnualRate, 1 / 12) - 1
  const safeInitW       = curInput.initDeposit * 0.30 / 10000
  const safePmtW        = curInput.monthlyPmt  * 0.30 / 10000
  const safeFvAccum     = isIRP ? fv(safeInitW, safePmtW, curInput.accumMonths, rSafeMonthly) : 0
  const safeFvHold      = isIRP ? safeFvAccum * Math.pow(1 + rSafeMonthly, curInput.holdMonths) : 0

  // 탭 변경 시 저장 목록 로드
  const fetchSaved = useCallback(async (id: string) => {
    setLoading(true)
    setSelectedSim(null)
    try {
      const list = await loadSimulations(id)
      setSavedList(list)
    } catch {
      setSavedList([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isLoggedIn) {
      fetchSaved(activeId)
    } else {
      setSavedList([])
    }
  }, [activeId, fetchSaved, isLoggedIn])

  function handleTabChange(id: string) {
    const t = TABS.find((t) => t.id === id)!
    if (!t.isKodex200) {
      setInputs((prev) => {
        if (prev[id] != null) return prev
        const d = t.defaultInputs!
        const ageMonths = birthdateToAgeMonths(d.birthdate)
        const holdMonths = ageMonths != null
          ? calcHoldMonths(d.retirementAge ?? 55, d.accumMonths, ageMonths)
          : d.holdMonths
        return { ...prev, [id]: { ...d, holdMonths } }
      })
    }
    setActiveId(id)
    setEditDraft(null)
    setSaveMsg(null)
  }

  function openEdit() {
    setEditDraft({ ...curInput })
  }

  function applyEdit() {
    if (!editDraft) return
    setInputs((prev) => ({ ...prev, [activeId]: { ...editDraft } }))
    setEditDraft(null)
  }

  function openSaveDialog() {
    const inp = curInput

    const fmtMan = (won: number) =>
      won % 10000 === 0
        ? `${Math.round(won / 10000).toLocaleString("ko-KR")}만`
        : `${Number(won / 10000).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}만`
    const fmtY = (months: number) =>
      months % 12 === 0
        ? `${months / 12}년`
        : `${(months / 12).toFixed(1)}년`
    const fmtYNum = (months: number) =>
      months % 12 === 0
        ? `${months / 12}`
        : `${(months / 12).toFixed(1)}`

    const pmt   = inp.monthlyPmt > 0 ? fmtMan(inp.monthlyPmt) : fmtMan(inp.initDeposit)
    const accum = fmtY(inp.accumMonths)
    const hold  = fmtYNum(inp.holdMonths)
    const age   = inp.retirementAge

    const autoTitle = `${pmt}(${accum} 납), ${hold}년 보관, ${age}세 연금`
    const ageMonths     = birthdateToAgeMonths(inp.birthdate)
    const totalInvested = inp.initDeposit + inp.monthlyPmt * inp.accumMonths
    const autoMemo = [
      `생년월일: ${inp.birthdate ? `${fmtBirthdate(inp.birthdate)} (${fmtAge(ageMonths ?? 0)})` : "—"}`,
      `초기 입금: ${fmtKRW(inp.initDeposit)}`,
      `월 납입금: ${fmtKRW(inp.monthlyPmt)}`,
      `적립 기간: ${fmtMonths(inp.accumMonths)}`,
      `연금 수령 나이: 만 ${inp.retirementAge}세`,
      `보관 기간(만 ${inp.retirementAge}세): ${fmtMonths(inp.holdMonths)}`,
      `총 납입원금: ${fmtKRW(totalInvested)}`,
      `커버드콜 배당률(연): ${(inp.ccAnnualRate * 100).toFixed(0)}%`,
    ].join("\n")

    setSaveDraft({ title: autoTitle, memo: autoMemo })
    setShowSaveDialog(true)
    setSaveMsg(null)
  }

  async function handleDelete(id: number) {
    try {
      await deleteSimulation(id)
      if (selectedSim?.id === id) setSelectedSim(null)
      await fetchSaved(activeId)
    } catch {
      setSaveMsg("삭제 실패. DB 연결을 확인하세요.")
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    setShowSaveDialog(false)
    try {
      await saveSimulation(activeId, tab.label, saveDraft.title, saveDraft.memo, curInput, rows)
      setSaveMsg("저장 완료!")
      await fetchSaved(activeId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ""
      if (msg.startsWith("IP_LIMIT_EXCEEDED:")) {
        setSaveMsg(msg.replace("IP_LIMIT_EXCEEDED:", ""))
      } else {
        setSaveMsg("저장 실패. DB 연결을 확인하세요.")
      }
    } finally {
      setSaving(false)
    }
  }

  const totalInvested = curInput.initDeposit + curInput.monthlyPmt * curInput.accumMonths

  return (
    <AppLayout>
      {/* 저장 다이얼로그 */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="font-bold text-gray-900 text-base mb-4">시뮬레이션 저장</h3>
            <div className="space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">제목</span>
                <input
                  type="text"
                  placeholder="예: 동민 보수적 시나리오"
                  value={saveDraft.title}
                  onChange={(e) => setSaveDraft({ ...saveDraft, title: e.target.value })}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">내용 (선택)</span>
                <textarea
                  placeholder="메모나 특이사항을 입력하세요"
                  value={saveDraft.memo}
                  onChange={(e) => setSaveDraft({ ...saveDraft, memo: e.target.value })}
                  rows={3}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
                />
              </label>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-5">
        {/* 헤더 */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">연금투자 시뮬레이션</h1>
            <PageHelpModal />
          </div>
          <p className="text-gray-500 text-sm">퇴직 시점 연금 시뮬레이션 (KODEX200 ETF vs KODEX200 타겟위클리커버드콜 ETF)</p>
        </div>

        {/* IP 사용 한도 초과 안내 */}
        {ipBlocked && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-red-500 text-lg flex-shrink-0">⚠</span>
            <div className="text-sm text-red-700">
              <p className="font-semibold mb-0.5">1시간 내 사용 한도(10회)를 초과했습니다.</p>
              <p className="text-xs text-red-600">잠시 후 다시 접속하거나, 계정이 있으면 <a href="/login" className="underline font-medium">로그인</a> 후 이용하세요. (로그인 시 제한 없음)</p>
            </div>
          </div>
        )}

        {/* 탭 */}
        <div className="flex gap-1 border-b border-gray-200">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeId === t.id
                  ? "bg-white border border-b-white border-gray-200 text-blue-700 -mb-px"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* KODEX 200 주가 탭 */}
        {isKodex200Tab && <Kodex200Panel />}

        {!isKodex200Tab && (<>

        {/* 안내 메모 */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <ul className="space-y-0.5">
            {(isIRP ? IRP_NOTES : NOTES).map((n) => (
              <li key={n} className="text-xs text-amber-800 flex gap-1.5">
                <span>※</span><span>{n}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 입력 값 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 text-sm">입력 값</h2>
            <button
              onClick={editDraft ? () => setEditDraft(null) : openEdit}
              disabled={ipBlocked}
              className="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {editDraft ? "취소" : "입력 값 수정"}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-2">
            <div className="flex justify-between text-sm border-b border-gray-100 pb-1">
              <span className="text-gray-500">생년월일</span>
              <span className="font-medium text-gray-800">
                {curInput.birthdate
                  ? `${fmtBirthdate(curInput.birthdate)} (${fmtAge(birthdateToAgeMonths(curInput.birthdate) ?? 0)})`
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between text-sm border-b border-gray-100 pb-1">
              <span className="text-gray-500">초기 입금</span>
              <span className="font-medium text-gray-800">{fmtKRW(curInput.initDeposit)}</span>
            </div>
            <div className="flex justify-between text-sm border-b border-gray-100 pb-1">
              <span className="text-gray-500">월 납입금</span>
              <span className="font-medium text-gray-800">{fmtKRW(curInput.monthlyPmt)}</span>
            </div>
            <div className="flex justify-between text-sm border-b border-gray-100 pb-1">
              <span className="text-gray-500">적립 기간</span>
              <span className="font-medium text-gray-800">{fmtMonths(curInput.accumMonths)}</span>
            </div>
            <div className="flex justify-between text-sm border-b border-gray-100 pb-1">
              <span className="text-gray-500">연금 수령 나이</span>
              <span className="font-medium text-gray-800">만 {curInput.retirementAge ?? 55}세</span>
            </div>
            <div className="flex justify-between text-sm border-b border-gray-100 pb-1">
              <span className="text-gray-500">보관 기간(만 {curInput.retirementAge ?? 55}세)</span>
              <span className="font-medium text-gray-800">{fmtMonths(curInput.holdMonths)}</span>
            </div>
            <div className="flex justify-between text-sm border-b border-gray-100 pb-1">
              <span className="text-gray-500">총 납입원금</span>
              <span className="font-medium text-gray-800">{fmtKRW(totalInvested)}</span>
            </div>
            <div className="flex justify-between text-sm border-b border-gray-100 pb-1">
              <span className="text-gray-500">커버드콜 배당률(연)</span>
              <span className="font-medium text-gray-800">{(curInput.ccAnnualRate * 100).toFixed(0)}%</span>
            </div>
            {isIRP && (
              <div className="flex justify-between text-sm border-b border-gray-100 pb-1">
                <span className="text-gray-500">안전자산 수익율(연)</span>
                <span className="font-medium text-gray-800">{((curInput.safeRate ?? 0.05) * 100).toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* IRP 안전자산 정보 카드 */}
        {isIRP && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
            <h2 className="font-semibold text-emerald-900 text-sm mb-3">안전자산 (납입액 30% · 연복리)</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-2">
              <div className="flex justify-between text-sm border-b border-emerald-100 pb-1">
                <span className="text-gray-500">월 납입 (30%)</span>
                <span className="font-medium text-gray-800">{fmtKRW(Math.round(curInput.monthlyPmt * 0.30))}</span>
              </div>
              <div className="flex justify-between text-sm border-b border-emerald-100 pb-1">
                <span className="text-gray-500">수익율(연)</span>
                <span className="font-medium text-emerald-700">{((curInput.safeRate ?? 0.05) * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-sm border-b border-emerald-100 pb-1">
                <span className="text-gray-500">적립 완료 ({fmtMonths(curInput.accumMonths)})</span>
                <span className="font-medium text-gray-800">{fmtWan(safeFvAccum)}만원</span>
              </div>
              <div className="flex justify-between text-sm border-b border-emerald-100 pb-1">
                <span className="text-gray-500">퇴직 시점 ({fmtMonths(curInput.holdMonths)})</span>
                <span className="font-medium text-gray-800">{fmtWan(safeFvHold)}만원</span>
              </div>
            </div>
          </div>
        )}

        {/* 입력 값 수정 폼 */}
        {editDraft && (() => {
          const draftErrors = validateDraft(editDraft)
          return (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h3 className="font-semibold text-blue-900 text-sm mb-4">입력 값 수정</h3>
            <div className={`grid gap-4 ${isIRP ? "grid-cols-4" : "grid-cols-3"}`}>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-600">생년월일</span>
                <input
                  type="date"
                  min="1940-01-01"
                  max="2050-12-31"
                  value={editDraft.birthdate}
                  onChange={(e) => {
                    const bd = e.target.value
                    const next: InputValues = { ...editDraft, birthdate: bd }
                    const ageMonths = birthdateToAgeMonths(bd)
                    if (ageMonths != null) next.holdMonths = calcHoldMonths(next.retirementAge ?? 55, next.accumMonths, ageMonths)
                    setEditDraft(next)
                  }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-600">초기 입금 (원) : 지금까지 투자된 금액으로 입력 가능</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editDraft.initDeposit.toLocaleString("ko-KR")}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^0-9]/g, ""))
                    setEditDraft({ ...editDraft, initDeposit: isNaN(n) ? 0 : n })
                  }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-600">월 납입금 (원)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editDraft.monthlyPmt.toLocaleString("ko-KR")}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^0-9]/g, ""))
                    setEditDraft({ ...editDraft, monthlyPmt: isNaN(n) ? 0 : n })
                  }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-600">적립 기간 (개월)</span>
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={editDraft.accumMonths}
                  onChange={(e) => {
                    const accum = Number(e.target.value)
                    const next: InputValues = { ...editDraft, accumMonths: accum }
                    const ageMonths = birthdateToAgeMonths(next.birthdate)
                    if (ageMonths != null) next.holdMonths = calcHoldMonths(next.retirementAge ?? 55, accum, ageMonths)
                    setEditDraft(next)
                  }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-600">연금 수령 나이 (만)</span>
                <input
                  type="number"
                  min={55}
                  max={80}
                  value={editDraft.retirementAge ?? 55}
                  onChange={(e) => {
                    const age = Number(e.target.value)
                    const next: InputValues = { ...editDraft, retirementAge: age }
                    const ageMonths = birthdateToAgeMonths(next.birthdate)
                    if (ageMonths != null) next.holdMonths = calcHoldMonths(age, next.accumMonths, ageMonths)
                    setEditDraft(next)
                  }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-600">커버드콜 배당률 (% / 연)</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.1}
                  value={(editDraft.ccAnnualRate * 100).toFixed(1)}
                  onChange={(e) => setEditDraft({ ...editDraft, ccAnnualRate: Number(e.target.value) / 100 })}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </label>
              {isIRP && (
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">안전자산 수익율 (% / 연)</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.1}
                    value={((editDraft.safeRate ?? 0.05) * 100).toFixed(1)}
                    onChange={(e) => setEditDraft({ ...editDraft, safeRate: Number(e.target.value) / 100 })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </label>
              )}
            </div>
            {draftErrors.length > 0 && (
              <ul className="mt-3 space-y-1">
                {draftErrors.map((err) => (
                  <li key={err} className="text-xs text-red-600 flex gap-1">
                    <span>⚠</span><span>{err}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={applyEdit}
                disabled={draftErrors.length > 0}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                적용
              </button>
              <button
                onClick={() => {
                  setEditDraft(null)
                  const d = tab.defaultInputs!
                  const ageMonths = birthdateToAgeMonths(d.birthdate)
                  const holdMonths = ageMonths != null
                    ? calcHoldMonths(d.retirementAge ?? 55, d.accumMonths, ageMonths)
                    : d.holdMonths
                  setInputs((prev) => ({ ...prev, [activeId]: { ...d, holdMonths } }))
                }}
                className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
              >
                기본값으로 초기화
              </button>
            </div>
          </div>
          )
        })()}

        {/* 시뮬레이션 테이블 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">퇴직 시점 연금 시뮬레이션</h2>
            <div className="flex items-center gap-3">
              {saveMsg && (
                <span className={`text-xs ${saveMsg.includes("실패") ? "text-red-500" : "text-emerald-600"}`}>
                  {saveMsg}
                </span>
              )}
              {isLoggedIn ? (
                <button
                  onClick={openSaveDialog}
                  disabled={saving}
                  className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-400 transition-colors"
                >
                  {saving ? "저장 중..." : "시뮬레이션 저장"}
                </button>
              ) : (
                <a
                  href="/login"
                  className="text-xs px-3 py-1.5 rounded-lg border border-emerald-400 text-emerald-600 hover:bg-emerald-50 transition-colors"
                >
                  로그인 후 저장
                </a>
              )}
            </div>
          </div>
          <SimTable rows={rows} accumMonths={curInput.accumMonths} holdMonths={curInput.holdMonths} />
          <SimSummary rows={rows} inp={curInput} />
        </div>

        {/* 저장된 시뮬레이션 목록 — 로그인 사용자 전용 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 text-sm mb-3">저장된 시뮬레이션</h2>

          {!isLoggedIn ? (
            <p className="text-sm text-gray-400">
              <a href="/login" className="text-blue-600 underline">로그인</a>하면 시뮬레이션을 저장하고 불러올 수 있습니다.
            </p>
          ) : loading ? (
            <p className="text-sm text-gray-400">불러오는 중...</p>
          ) : savedList.length === 0 ? (
            <p className="text-sm text-gray-400">저장된 시뮬레이션이 없습니다.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {savedList.map((sim) => (
                <div
                  key={sim.id}
                  className={`flex items-center rounded-lg border transition-colors ${
                    selectedSim?.id === sim.id
                      ? "bg-purple-100 border-purple-400"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <button
                    onClick={() => setSelectedSim(selectedSim?.id === sim.id ? null : sim)}
                    className={`text-xs px-3 py-2 transition-colors ${
                      selectedSim?.id === sim.id
                        ? "text-purple-700 font-medium"
                        : "text-gray-600"
                    }`}
                  >
                    {sim.savedBy && <span className="font-medium mr-1">{sim.savedBy}</span>}
                    {fmtDatetime(sim.savedAt)}{sim.title ? ` · ${sim.title.slice(0, 30)}${sim.title.length > 30 ? "…" : ""}` : ""}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(sim.id) }}
                    className={`pr-2 pl-1 text-xs transition-colors ${
                      selectedSim?.id === sim.id
                        ? "text-purple-400 hover:text-purple-700"
                        : "text-gray-300 hover:text-red-500"
                    }`}
                    title="삭제"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 선택된 저장 시뮬레이션 */}
        {selectedSim && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-semibold text-gray-900 text-sm">
                {selectedSim.savedBy && <span className="text-gray-500 font-normal mr-1">{selectedSim.savedBy}</span>}{selectedSim.title || "저장된 시뮬레이션"} — {fmtDatetime(selectedSim.savedAt)}
              </h2>
              <button
                onClick={() => {
                  setInputs((prev) => ({ ...prev, [activeId]: { ...selectedSim.inputs } }))
                  setEditDraft(null)
                  setSaveMsg("입력값이 적용되었습니다.")
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                기본값으로 저장
              </button>
              <button
                onClick={() => setSelectedSim(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                닫기
              </button>
            </div>

            {/* 메모 */}
            {selectedSim.memo && (
              <p className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                {selectedSim.memo}
              </p>
            )}

            {/* 저장 당시 파라미터 */}
            <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1">
                {[
                  ["생년월일", selectedSim.inputs.birthdate ? `${fmtBirthdate(selectedSim.inputs.birthdate)}` : "—"],
                  ["초기 입금", fmtKRW(selectedSim.inputs.initDeposit)],
                  ["월 납입금", fmtKRW(selectedSim.inputs.monthlyPmt)],
                  ["적립 기간", fmtMonths(selectedSim.inputs.accumMonths)],
                  ["연금 수령 나이", `만 ${selectedSim.inputs.retirementAge ?? 55}세`],
                  ["보관 기간", fmtMonths(selectedSim.inputs.holdMonths)],
                  ["총 납입원금", fmtKRW(selectedSim.inputs.initDeposit + selectedSim.inputs.monthlyPmt * selectedSim.inputs.accumMonths)],
                  ["커버드콜 배당률(연)", (selectedSim.inputs.ccAnnualRate * 100).toFixed(0) + "%"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs border-b border-purple-100 pb-1">
                    <span className="text-purple-700">{k}</span>
                    <span className="font-medium text-purple-900">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <SimTable
              rows={selectedSim.results}
              accumMonths={selectedSim.inputs.accumMonths}
              holdMonths={selectedSim.inputs.holdMonths}
              muted
            />
            <SimSummary rows={selectedSim.results} inp={selectedSim.inputs} muted />
          </div>
        )}

        {/* 면책조항 푸터 */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <span className="text-amber-500 text-base flex-shrink-0 mt-0.5">⚠</span>
            <div>
              <p className="text-xs font-semibold text-amber-800 mb-0.5">투자 위험 안내</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                이 시뮬레이션은 <span className="font-semibold">참고용</span>이며 미래 수익을 보장하지 않습니다.
                세금·수수료 미반영. 투자 결과는 <span className="font-semibold">본인 책임</span>입니다.
              </p>
              <p className="text-xs text-amber-600 mt-1">
                계산 오류가 있을 수 있습니다. 오류 발견 시{" "}
                <a href="mailto:baramgil@hotmail.com?subject=연금투자 시뮬레이션 오류 제보" className="font-semibold underline underline-offset-2 hover:text-amber-800">
                  baramgil@hotmail.com (신기철)
                </a>
                으로 알려주시면 감사하겠습니다.
              </p>
            </div>
          </div>
          <DisclaimerModal />
        </div>

        </>)}{/* end !isKodex200Tab */}

      </div>
    </AppLayout>
  )
}
