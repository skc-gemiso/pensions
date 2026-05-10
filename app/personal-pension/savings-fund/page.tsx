"use client"

import { useState, useEffect, useCallback, Fragment } from "react"
import { createPortal } from "react-dom"
import { useSession } from "next-auth/react"
import AppLayout from "@/components/AppLayout"
import {
  saveSimulation,
  loadSimulations,
  deleteSimulation,
  type InputValues,
  type ComputedRow,
  type SavedSim,
} from "./actions"

// ─── 상수 ────────────────────────────────────────────────────────────────────

const ANNUAL_RATES = [-0.2, -0.1, 0, 0.05, 0.1, 0.2]
const RATE_LABELS  = ["-20%", "-10%", "0%", "5%", "10%", "20%"]

const NOTES = [
  "KODEX200 타겟위클리커버드콜 ETF : 년 고정 수익률 15% (세후 약 12%)",
]

type TabMeta = {
  id: string
  label: string
  defaultInputs: InputValues
}

const TABS: TabMeta[] = [
  {
    id: "reference",
    label: "수익율 확인",
    defaultInputs: { initDeposit: 0, monthlyPmt: 200000, accumMonths: 120, holdMonths: 60, ccAnnualRate: 0.12, retirementAge: 55, birthdate: "2000-01-01" },
  },
  {
    id: "dongmin",
    label: "동민",
    defaultInputs: { initDeposit: 0, monthlyPmt: 200000, accumMonths: 120, holdMonths: 235, ccAnnualRate: 0.12, retirementAge: 55, birthdate: "2000-11-21" },
  },
  {
    id: "goeun",
    label: "고은",
    defaultInputs: { initDeposit: 0, monthlyPmt: 200000, accumMonths: 120, holdMonths: 292, ccAnnualRate: 0.12, retirementAge: 55, birthdate: "2005-08-30" },
  },
  {
    id: "shine",
    label: "샤인",
    defaultInputs: { initDeposit: 0, monthlyPmt: 200000, accumMonths: 120, holdMonths: 365, ccAnnualRate: 0.12, retirementAge: 55, birthdate: "2011-10-10" },
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

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function fmtMonths(m: number) {
  const y = (m / 12).toFixed(1)
  return `${m}개월 (${y}년)`
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
  if (v.startsWith("+")) return "text-blue-600"
  if (v.startsWith("-")) return "text-red-500"
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

function PageHelpModal() {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<"summary" | "detail" | "criteria">("criteria")

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
            <div className="flex gap-1 px-6 pt-3 flex-shrink-0">
              {(["criteria", "summary", "detail"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSection(s)}
                  className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                    section === s ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {s === "summary" ? "화면 기능 요약" : s === "detail" ? "화면 상세 안내" : "투자 기준"}
                </button>
              ))}
            </div>

            {/* 본문 */}
            <div className="overflow-y-auto px-6 py-4 space-y-5 text-sm">

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
                        ["🗂 탭 선택", "동민·고은·샤인 등 대상자별 시뮬레이션"],
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

                  {/* 섹션 2: 입력 파라미터 */}
                  <div>
                    <p className="font-semibold text-gray-800 mb-2">② 입력 파라미터 설명</p>
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
                        { acct: "개인형 IRP", color: "bg-emerald-50 border-emerald-200 text-emerald-800", desc: "연말정산 소득공제 혜택 (13.2% ~ 16.5%)" },
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
                KODEX200<br />연평균 상승률
              </th>
              <th colSpan={4} className="px-3 py-2 text-blue-700 font-semibold border-r border-gray-200">
                KODEX200 ETF
                <HelpPopover
                  title="KODEX 200 ETF (티커: 069500)"
                  desc="운용사: 삼성자산운용 | 코스피200 지수 추종 인덱스 ETF"
                  composition={[
                    "삼성전자 (22.81%)",
                    "SK하이닉스 (14.86%)",
                    "KODEX200 (17.09%) 등 대형 우량주 위주 구성",
                    "코스피 상위 200개 종목 분산 투자",
                    "운용보수 연 0.15% (저비용)",
                  ]}
                  pros={[
                    "코스피200 지수와 동일한 성과 — 시장 성장 그대로 수혜",
                    "낮은 운용보수(0.15%)로 장기 보유에 유리",
                    "국내 최대 규모 ETF — 유동성 풍부",
                    "상승장에서 높은 시세차익 기대",
                  ]}
                  cons={[
                    "하락장 손실 그대로 반영 (지수 방어 기능 없음)",
                    "배당금 거의 없어 퇴직 후 현금흐름 확보 어려움",
                    "시장 전체 위험에 고스란히 노출",
                  ]}
                  href="https://www.kodex.com"
                />
              </th>
              <th colSpan={4} className="px-3 py-2 text-emerald-700 font-semibold border-r border-gray-200">
                커버드콜 ETF
                <HelpPopover
                  title="KODEX 200 타겟위클리커버드콜 ETF"
                  desc="운용사: 삼성자산운용 | 월배당 커버드콜 ETF"
                  composition={[
                    "기초자산: KODEX200 ETF",
                    "전략: 매주 콜옵션 매도(위클리 커버드콜)",
                    "월배당 지급 — 연 약 15% (세후 약 12%)",
                  ]}
                  pros={[
                    "안정적인 월배당 수익 (연 약 15%)",
                    "하락장에서 프리미엄으로 손실 일부 보전",
                    "은퇴 후 고정 현금흐름(월수입) 확보에 최적",
                    "위클리 옵션 매도로 배당 안정성 강화",
                  ]}
                  cons={[
                    "주가 상승 시 시세차익이 콜옵션 행사가에 제한됨",
                    "강세장에서 KODEX200 ETF 대비 수익 낮음",
                    "배당소득세 15.4% 부담 (종합계좌 기준)",
                    "인덱스 ETF보다 운용보수가 높음",
                  ]}
                  href="https://www.kodex.com"
                />
              </th>
              <th colSpan={4} className="px-3 py-2 text-purple-700 font-semibold border-r border-gray-200">차액 (커버드콜 ETF − KODEX200 ETF)</th>
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

  const visibleTabs = (role === "admin" || role === "khj")
    ? TABS
    : TABS.filter((t) => t.id === "reference")

  const [activeId, setActiveId]     = useState(TABS[0].id)
  const [inputs, setInputs]         = useState<Record<string, InputValues>>(
    Object.fromEntries(TABS.map((t) => {
      const ageMonths = birthdateToAgeMonths(t.defaultInputs.birthdate)
      const holdMonths = ageMonths != null
        ? calcHoldMonths(t.defaultInputs.retirementAge ?? 55, t.defaultInputs.accumMonths, ageMonths)
        : t.defaultInputs.holdMonths
      return [t.id, { ...t.defaultInputs, holdMonths }]
    }))
  )
  const [editDraft, setEditDraft]     = useState<InputValues | null>(null)
  const [savedList, setSavedList]     = useState<SavedSim[]>([])
  const [selectedSim, setSelectedSim] = useState<SavedSim | null>(null)
  const [saving, setSaving]           = useState(false)
  const [saveMsg, setSaveMsg]         = useState<string | null>(null)
  const [loading, setLoading]         = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveDraft, setSaveDraft]     = useState({ title: "", memo: "" })

  // role이 결정되면 첫 번째 visible 탭으로 맞춤
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.find((t) => t.id === activeId)) {
      setActiveId(visibleTabs[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  const tab      = TABS.find((t) => t.id === activeId)!
  const curInput = inputs[activeId]
  const rows     = calculateRows(curInput)

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
    fetchSaved(activeId)
  }, [activeId, fetchSaved])

  function handleTabChange(id: string) {
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
        ? `${won / 10000}만`
        : `${(won / 10000).toFixed(1)}만`
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
    } catch {
      setSaveMsg("저장 실패. DB 연결을 확인하세요.")
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

        {/* 안내 메모 */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <ul className="space-y-0.5">
            {NOTES.map((n) => (
              <li key={n} className="text-xs text-amber-800 flex gap-1.5">
                <span>※</span><span>{n}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 입력 파라미터 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 text-sm">입력 파라미터</h2>
            <button
              onClick={editDraft ? () => setEditDraft(null) : openEdit}
              className="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors"
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
          </div>
        </div>

        {/* 입력 값 수정 폼 */}
        {editDraft && (() => {
          const draftErrors = validateDraft(editDraft)
          return (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h3 className="font-semibold text-blue-900 text-sm mb-4">입력 값 수정</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
                  const ageMonths = birthdateToAgeMonths(tab.defaultInputs.birthdate)
                  const holdMonths = ageMonths != null
                    ? calcHoldMonths(tab.defaultInputs.retirementAge ?? 55, tab.defaultInputs.accumMonths, ageMonths)
                    : tab.defaultInputs.holdMonths
                  setInputs((prev) => ({ ...prev, [activeId]: { ...tab.defaultInputs, holdMonths } }))
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
              <button
                onClick={openSaveDialog}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-400 transition-colors"
              >
                {saving ? "저장 중..." : "시뮬레이션 저장"}
              </button>
            </div>
          </div>
          <SimTable rows={rows} accumMonths={curInput.accumMonths} holdMonths={curInput.holdMonths} />
          <SimSummary rows={rows} inp={curInput} />
        </div>

        {/* 저장된 시뮬레이션 목록 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 text-sm mb-3">저장된 시뮬레이션</h2>

          {loading ? (
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
      </div>
    </AppLayout>
  )
}
