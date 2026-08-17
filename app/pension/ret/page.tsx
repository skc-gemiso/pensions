"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import AppLayout from "@/components/AppLayout"
import HelpModal, { H, Box, ColTable } from "@/components/HelpModal"
import { getProfile, type ProfileView } from "@/app/actions/profile"
import { getEtfDividendHistory } from "@/app/sim/actions"
// 수령 개시 나이는 개인연금과 같은 값을 쓴다 (PENSION_PER_PAYOUT_AGE)
import { getPerConfig } from "@/app/pension/per/actions"

// 프로필(config/.env → lib/settings.ts)을 못 읽었을 때만 쓰는 값
const FALLBACK_JOIN = "2015-02-23"
const FALLBACK_RETIRE = "2034-06-30"
const ANNUAL_SALARY_INCREASE_MAN = 240 // 만원/년

// 사용자 제공 예상 데이터 (2030~2034)
const USER_PROJECTIONS: Record<number, { salaryMan: number; grossMan: number; netMan: number }> = {
  2030: { salaryMan: 9_992,  grossMan: 14_800, netMan: 14_200 },
  2031: { salaryMan: 10_232, grossMan: 15_500, netMan: 14_800 },
  2032: { salaryMan: 10_472, grossMan: 16_200, netMan: 15_400 },
  2033: { salaryMan: 10_712, grossMan: 16_900, netMan: 16_000 },
  2034: { salaryMan: 10_952, grossMan: 17_600, netMan: 16_700 },
}

// 퇴직금 운용 시뮬레이션 기준 — IRP·ISA 는 운용하지 않으므로 일반 계좌 기준이다
const CC_STOCK_CODE = "498400"        // KODEX 200 타겟위클리커버드콜
const CC_FALLBACK_ANNUAL_RATE = 0.17  // 분배 이력을 못 읽었을 때만 쓰는 값
// 분배금 과세는 계산에서 뺐다.
// 커버드콜 분배금은 대부분 파생상품 매매이익이라 실제 과세 대상은 주당 과세표준액뿐이고,
// 그 비율이 분배금의 4~5% 수준이라 실효세율이 1%에 못 미친다.
// 금융소득종합과세(연 2,000만원)도 과표 기준이면 연 분배금이 5억에 가까워야 걸린다.

// DB형 퇴직연금을 개인이 수령·운용할 수 있게 되는 나이
const DB_ACCESS_AGE = 55

// 퇴직소득세 계산 (2023년 개정 기준, 만원 단위, 근사치)
function calcRetirementTax(grossMan: number, tenureYears: number): number {
  if (tenureYears <= 0) return 0

  // 근속연수공제
  let deduction: number
  if (tenureYears <= 5) deduction = 100 * tenureYears
  else if (tenureYears <= 10) deduction = 500 + 200 * (tenureYears - 5)
  else if (tenureYears <= 20) deduction = 1_500 + 250 * (tenureYears - 10)
  else deduction = 4_000 + 300 * (tenureYears - 20)

  const taxableBase = Math.max(0, grossMan - deduction)
  const converted = (taxableBase / tenureYears) * 12

  // 환산급여공제
  let convDeduction: number
  if (converted <= 800) convDeduction = converted
  else if (converted <= 7_000) convDeduction = 800 + (converted - 800) * 0.6
  else if (converted <= 10_000) convDeduction = 4_520 + (converted - 7_000) * 0.55
  else if (converted <= 30_000) convDeduction = 6_170 + (converted - 10_000) * 0.45
  else convDeduction = 15_170 + (converted - 30_000) * 0.35

  const taxBase = Math.max(0, converted - convDeduction)

  // 기본세율 (2023년 이후 과표구간)
  let taxAtRate: number
  if (taxBase <= 1_400) taxAtRate = taxBase * 0.06
  else if (taxBase <= 5_000) taxAtRate = 84 + (taxBase - 1_400) * 0.15
  else if (taxBase <= 8_800) taxAtRate = 624 + (taxBase - 5_000) * 0.24
  else if (taxBase <= 15_000) taxAtRate = 1_536 + (taxBase - 8_800) * 0.35
  else if (taxBase <= 30_000) taxAtRate = 3_706 + (taxBase - 15_000) * 0.38
  else if (taxBase <= 50_000) taxAtRate = 9_406 + (taxBase - 30_000) * 0.40
  else taxAtRate = 17_406 + (taxBase - 50_000) * 0.42

  const incomeTax = (taxAtRate / 12) * tenureYears
  return Math.round(incomeTax * 1.1) // +지방소득세 10%
}

function fmtMan(man: number): string {
  if (man >= 10_000) {
    const ok = Math.floor(man / 10_000)
    const rem = man % 10_000
    if (rem === 0) return `${ok}억원`
    return `${ok}억 ${rem.toLocaleString()}만원`
  }
  return `${man.toLocaleString()}만원`
}

function calcTenure(from: Date, to: Date): { years: number; months: number; days: number; totalDays: number } {
  const totalDays = Math.floor((to.getTime() - from.getTime()) / 86_400_000)
  let years = to.getFullYear() - from.getFullYear()
  let months = to.getMonth() - from.getMonth()
  if (months < 0) { years -= 1; months += 12 }
  if (to.getDate() < from.getDate()) months -= 1
  if (months < 0) { years -= 1; months += 12 }
  return { years, months, days: to.getDate(), totalDays }
}

function calcCurrentSeverance(
  monthlyWon: number, tenureDays: number, ccAnnualRate: number, holdMonths: number
) {
  const grossMan = Math.round((monthlyWon * (tenureDays / 365)) / 10_000)
  const tenureYears = Math.max(1, Math.round(tenureDays / 365))
  const taxMan = calcRetirementTax(grossMan, tenureYears)
  const netMan = grossMan - taxMan
  // 매입 시점부터 수령 개시까지 재투자한 뒤 받는 월 분배금
  const grown = grownValue(netMan, ccAnnualRate, holdMonths)
  const ccMonthlyMan = Math.round(grown * ccAnnualRate / 12)
  return { grossMan, netMan, taxMan, ccMonthlyMan }
}

/**
 * 분배금을 전액 재투자했을 때의 평가액.
 * 주가는 현재가 고정(상승률 0%)이라 분배금만큼만 늘어난다.
 */
function grownValue(principal: number, ccAnnualRate: number, months: number): number {
  return principal * Math.pow(1 + ccAnnualRate / 12, months)
}

/** 'YYYY-MM-DD' → Date (UTC 밀림 방지) */
function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export default function RetirementPensionPage() {
  const today = useMemo(() => new Date(), [])
  const [profile, setProfile] = useState<ProfileView | null>(null)
  const [ccRate, setCcRate] = useState<{ annual: number; count: number } | null>(null)

  useEffect(() => { getProfile().then(setProfile).catch(() => {}) }, [])

  // 커버드콜 분배율 — 개인연금 화면과 같은 기준(최근 12회 평균)을 쓴다
  useEffect(() => {
    getEtfDividendHistory(CC_STOCK_CODE)
      .then(rows => {
        const recent = rows.slice(0, 12)
        if (recent.length === 0) return
        const monthly = recent.reduce((s, r) => s + r.dist_rate, 0) / recent.length / 100
        setCcRate({ annual: monthly * 12, count: recent.length })
      })
      .catch(() => {})
  }, [])

  const [payoutAge, setPayoutAge] = useState(63)
  useEffect(() => { getPerConfig().then(c => setPayoutAge(c.payout_age)).catch(() => {}) }, [])

  const ccAnnualRate = ccRate?.annual ?? CC_FALLBACK_ANNUAL_RATE

  // 입사일·정년은 공통 프로필에서 온다 (정년 규정: 만 60세가 되는 달의 말일 등)
  const JOIN_DATE = useMemo(() => toDate(profile?.join_date ?? FALLBACK_JOIN), [profile])
  const retireDate = useMemo(() => toDate(profile?.retire_date ?? FALLBACK_RETIRE), [profile])
  const LEGAL_RETIRE_YEAR = retireDate.getFullYear()

  const birthIdx = useMemo(() => {
    const b = toDate(profile?.birth_date ?? "1974-06-04")
    return b.getFullYear() * 12 + b.getMonth()
  }, [profile])

  /** 수령 개시 시점 — 만 payoutAge 세가 되는 연·월 */
  const payoutIdx = birthIdx + payoutAge * 12
  /** 퇴직연금을 개인이 운용할 수 있게 되는 시점 — 만 55세 */
  const accessIdx = birthIdx + DB_ACCESS_AGE * 12

  /**
   * 매입 시점 = max(퇴직 시점, 만 55세)
   *
   * DB형이라 두 가지 제약이 함께 걸린다.
   *   1. 퇴직 전에는 회사가 적립금을 운용하므로 손댈 수 없다
   *   2. 만 55세 전에는 퇴직연금을 수령해 개인이 운용할 수 없다
   */
  const buyIdxOf = useCallback(
    (retireIdx: number) => Math.max(retireIdx, accessIdx),
    [accessIdx]
  )
  const holdMonthsOf = useCallback(
    (retireIdx: number) => Math.max(0, payoutIdx - buyIdxOf(retireIdx)),
    [payoutIdx, buyIdxOf]
  )

  const tenure = useMemo(() => calcTenure(JOIN_DATE, today), [JOIN_DATE, today])

  // 현재 기준 추정 퇴직금 (급여명세서 지급액 기준: 6,900,000원/월)
  // 지금 그만두면 만 55세가 되어야 굴릴 수 있다
  const currentHoldMonths = holdMonthsOf(today.getFullYear() * 12 + today.getMonth())
  const currentSeverance = useMemo(
    () => calcCurrentSeverance(6_900_000, tenure.totalDays, ccAnnualRate, currentHoldMonths),
    [tenure.totalDays, ccAnnualRate, currentHoldMonths]
  )

  // 정년까지 남은 기간
  const remaining = useMemo(() => calcTenure(today, retireDate), [today, retireDate])

  // 진행률 (입사~정년)
  const totalDaysToRetire = useMemo(
    () => Math.floor((retireDate.getTime() - JOIN_DATE.getTime()) / 86_400_000),
    [retireDate]
  )
  const progressPct = Math.min(100, Math.round((tenure.totalDays / totalDaysToRetire) * 100))

  // 테이블 행 생성 (2030~2034: 사용자 데이터, 2026~2029: 선형 보간)
  const tableRows = useMemo(() => {
    const rows = []
    const currentYear = today.getFullYear()
    const startYear = Math.max(currentYear, 2026)

    for (let year = startYear; year <= LEGAL_RETIRE_YEAR; year++) {
      const isConfirmed = year in USER_PROJECTIONS
      const tenureYears = year - 2015
      const isLegal = year === LEGAL_RETIRE_YEAR

      if (isConfirmed) {
        const d = USER_PROJECTIONS[year]
        rows.push({
          year,
          tenureYears,
          salaryMan: d.salaryMan,
          grossMan: d.grossMan,
          netMan: d.netMan,
          taxMan: d.grossMan - d.netMan,
          isConfirmed: true,
          isLegal,
        })
      } else {
        // 2026~2029: 법정 퇴직금 기준 추정 (연봉 ÷ 12 × 근속연수)
        const yearOffset = year - 2030
        const salaryMan = USER_PROJECTIONS[2030].salaryMan + yearOffset * ANNUAL_SALARY_INCREASE_MAN
        const grossMan = Math.round(salaryMan / 12 * tenureYears)
        const taxMan = calcRetirementTax(grossMan, tenureYears)
        const netMan = grossMan - taxMan
        rows.push({
          year,
          tenureYears,
          salaryMan,
          grossMan,
          netMan,
          taxMan,
          isConfirmed: false,
          isLegal,
        })
      }
    }
    return rows
  }, [today])

  /**
   * 실수령 퇴직금을 커버드콜로 매입 → 수령 개시까지 분배금 전액 재투자
   * → 그 뒤부터 분배금만 수령.
   *
   * 매입 시점은 퇴직 시점과 만 55세 중 늦은 쪽이다 (buyIdxOf 주석 참고).
   * 그 전에 발생하는 분배금은 없다.
   */
  const ccRows = useMemo(() => tableRows.map(row => {
    // 퇴직 시점은 그 해 정년월로 잡는다 — 행 간 개월 차이가 정확히 12의 배수가 된다
    const retireIdx  = row.year * 12 + retireDate.getMonth()
    const buyIdx     = buyIdxOf(retireIdx)
    const holdMonths = holdMonthsOf(retireIdx)

    const valueMan     = grownValue(row.netMan, ccAnnualRate, holdMonths)
    const yearlyDist   = Math.round(valueMan * ccAnnualRate)
    const monthlyDist  = Math.round(yearlyDist / 12)
    return {
      ...row,
      holdMonths,
      buyYm: `${Math.floor(buyIdx / 12)}.${String((buyIdx % 12) + 1).padStart(2, "0")}`,
      // 퇴직보다 만 55세가 늦어 기다려야 하는 경우
      waiting: buyIdx > retireIdx,
      valueMan: Math.round(valueMan),
      yearlyDist, monthlyDist,
    }
  }), [tableRows, ccAnnualRate, retireDate, buyIdxOf, holdMonthsOf])

  const joinStr = "2015.02.23"
  const retireStr = `${LEGAL_RETIRE_YEAR}년 ${String(retireDate.getMonth() + 1).padStart(2, "0")}월`
  const retireMonth = retireDate.getMonth() + 1
  /** 만 55세가 되는 연·월 표기 */
  const accessStr = `${Math.floor(accessIdx / 12)}.${String((accessIdx % 12) + 1).padStart(2, "0")}`
  /** 정년에 퇴직했을 때의 재투자 개월 — 도움말 예시로 쓴다 */
  const retireHoldMonths = holdMonthsOf(retireDate.getFullYear() * 12 + retireDate.getMonth())

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-5">

        {/* 헤더 */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">퇴직연금</h1>
            <HelpModal
              variant="page"
              title="퇴직연금 계산 안내"
              lead="이 화면의 숫자가 어떤 전제로 계산되는지"
              tabs={[
                { key: "basis", label: "계산 전제", body: (
                  <>
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl px-5 py-4 text-white">
                      <p className="font-bold text-base mb-1">이 화면의 금액은 전부 &ldquo;추정치&rdquo;입니다</p>
                      <p className="text-sm text-blue-100">
                        회사가 통보한 확정 금액이 아니라, 아래 전제로 계산한 값입니다.
                      </p>
                    </div>

                    <Box>
                      <H>DB형(확정급여형) 기준입니다</H>
                      <p className="text-xs text-gray-700 leading-relaxed">
                        퇴직금이 운용 성과가 아니라 <b>퇴직 직전 평균임금 × 근속연수</b>로 정해지는 방식입니다.
                        정년 전까지는 회사가 적립금을 운용하므로 개인이 손댈 수 없고,
                        퇴직금은 <b>정년({LEGAL_RETIRE_YEAR}년 {retireMonth}월)에 손에 들어옵니다.</b>
                      </p>
                    </Box>

                    <Box>
                      <H>어디서 온 값인가</H>
                      <ColTable rows={[
                        ["입사일 · 정년", <>공통 프로필 환경 변수(<code>PROFILE_*</code>). 퇴직연금·개인연금이 같은 값을 씁니다</>],
                        ["평균임금", <>급여명세서 지급액 <b>월 690만원</b>을 코드에 고정해 뒀습니다</>],
                        ["연봉 인상", <>매년 <b>240만원</b> 균등 인상 가정</>],
                        ["2030~2034", <>사전 계산해 둔 값(<code>USER_PROJECTIONS</code>)을 그대로 씁니다</>],
                        ["2026~2029", <>법정 퇴직금 공식(연봉 ÷ 12 × 근속연수)으로 추정합니다</>],
                        ["분배율", <>KODEX 200 타겟위클리커버드콜의 실제 지급 이력 최근 12회 평균</>],
                      ]} />
                    </Box>

                    <Box tone="amber">
                      <H>IRP·ISA 는 다루지 않습니다</H>
                      <p className="text-xs text-gray-700 leading-relaxed">
                        운용 계획이 없어 계산에서 뺐습니다. 퇴직금을 일시금으로 받아 <b>일반 계좌</b>에서
                        운용하는 기준이므로, 분배금에 연금소득세(3.3~5.5%)가 아니라 배당소득세(15.4%)가 붙습니다.
                        IRP 로 이전하면 퇴직소득세가 이연·감면되므로, 이 화면의 실수령액은 그만큼 보수적입니다.
                      </p>
                    </Box>
                  </>
                ) },
                { key: "tax", label: "퇴직소득세", body: (
                  <>
                    <Box>
                      <H>2023년 개정 기준으로 계산합니다</H>
                      <pre className="text-xs bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto text-gray-700">{`1. 과세표준 = 퇴직급여 − 근속연수공제
2. 환산급여 = 과세표준 ÷ 근속연수 × 12
3. 환산급여공제를 뺀 값에 기본세율 적용
4. 퇴직소득세 = 산출세액 ÷ 12 × 근속연수`}</pre>
                      <p className="text-xs text-gray-500 mt-2">지방소득세 10%가 포함된 금액입니다.</p>
                    </Box>

                    <Box>
                      <H>근속연수공제</H>
                      <ColTable rows={[
                        ["5년 이하", "100만원 × 근속연수"],
                        ["5~10년", "500만원 + 200만원 × (근속연수 − 5)"],
                        ["10~20년", "1,500만원 + 250만원 × (근속연수 − 10)"],
                        ["20년 초과", "4,000만원 + 300만원 × (근속연수 − 20)"],
                      ]} />
                      <p className="text-xs text-gray-500 mt-2">
                        오래 다닐수록 공제가 커져서, 근속연수가 늘면 세율이 완만하게 낮아집니다.
                      </p>
                    </Box>
                  </>
                ) },
                { key: "limit", label: "⚠️ 한계와 주의", body: (
                  <Box tone="amber">
                    <H>⚠️ 이 숫자가 그대로 실현되지 않는 이유</H>
                    <ul className="text-xs text-gray-700 space-y-2 list-disc pl-4 leading-relaxed">
                      <li><b>평균임금이 추정값입니다.</b> DB형 실제 산정은 퇴직 직전 3개월 평균임금 기준이라
                        상여·수당 구성에 따라 달라집니다.</li>
                      <li><b>연봉 인상률은 가정입니다.</b> 매년 240만원 균등 인상을 전제로 했습니다.</li>
                      <li><b>2029~2030년 사이 금액이 크게 뜁니다.</b> 두 구간의 계산 방식이 달라서 생기는 현상입니다.</li>
                      <li><b>분배율이 유지된다고 봤습니다.</b> 운용사가 분배 정책을 바꾸면 결과가 크게 달라집니다.</li>
                      <li><b>주가 변동을 반영하지 않았습니다.</b> 주가가 떨어지면 평가액도 분배금도 함께 줄어듭니다.</li>
                      <li><b>물가를 반영하지 않았습니다.</b></li>
                      <li><b>중도인출·회사 정책 변경</b>은 계산에 없습니다.</li>
                    </ul>
                  </Box>
                ) },
              ]}
            />
          </div>
          <p className="text-gray-500 text-sm">퇴직 시점별 예상 수령액 시뮬레이션 (DB형 기준)</p>
        </div>

        {/* 기본 정보 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">입사일</p>
            <p className="text-base font-bold text-gray-800">{joinStr}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">현재 근속</p>
            <p className="text-base font-bold text-blue-700">
              {tenure.years}년 {tenure.months}개월
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">정년(예정)</p>
            <p className="text-base font-bold text-gray-800">{retireStr}</p>
          </div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
            <p className="text-xs text-amber-500 mb-1">정년까지 남은 기간</p>
            <p className="text-base font-bold text-amber-700">
              {remaining.years}년 {remaining.months}개월
            </p>
          </div>
        </div>

        {/* 근속 진행 바 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs font-semibold text-gray-600">근속 진행 현황</span>
            <HelpModal
              title="근속 진행 현황"
              lead="입사일부터 정년까지 어디쯤 와 있는지"
              tabs={[
                { key: "how", label: "계산 방법", body: (
                  <>
                    <Box>
                      <H>진행률</H>
                      <pre className="text-xs bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto text-gray-700">{`진행률 = (오늘 − 입사일) ÷ (정년일 − 입사일) × 100`}</pre>
                      <p className="text-xs text-gray-500 mt-2">
                        일 단위로 계산합니다. 위 카드의 <b>현재 근속</b>·<b>정년까지 남은 기간</b>은
                        같은 기준을 연·월로 환산한 값입니다.
                      </p>
                    </Box>

                    <Box tone="blue">
                      <H>정년일이 {LEGAL_RETIRE_YEAR}년 {retireMonth}월인 이유</H>
                      <p className="text-xs text-gray-700 leading-relaxed">
                        정년 규정이 <b>만 60세가 되는 달의 말일</b>이기 때문입니다.
                        생일 당일이나 연말로 잡는 회사도 있어서, 규정을 환경 변수
                        (<code>PROFILE_RETIRE_RULE</code>)로 바꿀 수 있게 해 뒀습니다.
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        입사일·생년월일도 같은 프로필(<code>PROFILE_*</code>)에서 오며, 개인연금 화면과 공유합니다.
                      </p>
                    </Box>
                  </>
                ) },
              ]}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>입사 {joinStr}</span>
            <span className="font-medium text-blue-600">{progressPct}% 경과</span>
            <span>정년 {retireStr}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-400 h-3 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-300 mt-1">
            <span>2015</span>
            <span className="text-blue-400 font-medium">{today.getFullYear()}</span>
            <span>{LEGAL_RETIRE_YEAR}</span>
          </div>
        </div>

        {/* 현재 기준 예상 퇴직금 */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <p className="text-xs text-blue-500 font-medium mb-3 flex items-center gap-1.5 flex-wrap">
            현재 기준 예상 퇴직금
            <span className="text-blue-400 font-normal">
              ({today.getFullYear()}.{String(today.getMonth()+1).padStart(2,"0")}.{String(today.getDate()).padStart(2,"0")} 기준 · 근속 {tenure.years}년 {tenure.months}개월)
            </span>
            <HelpModal
              title="현재 기준 예상 퇴직금"
              lead="오늘 그만둔다면 얼마를 받는가"
              tabs={[
                { key: "cols", label: "값 설명", body: (
                  <Box>
                    <ColTable rows={[
                      ["세전 퇴직금", <>월 690만원 × 근속일수({tenure.totalDays}일) ÷ 365. <b>근속 1년당 한 달치 급여</b>라는 법정 산식입니다</>],
                      ["퇴직소득세", <>2023년 개정 기준 근사치. 근속연수공제·환산급여공제를 적용합니다 — 자세한 식은 페이지 도움말의 <b>퇴직소득세</b> 탭에</>],
                      ["실수령액", <>세전 퇴직금 − 퇴직소득세. 아래 커버드콜 시뮬레이션의 <b>투자 원금</b>이 되는 금액입니다</>],
                      [`${payoutAge}세 월 분배금`, <>실수령액을 만 {DB_ACCESS_AGE}세에 커버드콜로 매입하고 {payoutAge}세까지 분배금을 재투자했을 때, {payoutAge}세부터 매달 받는 금액</>],
                    ]} />
                  </Box>
                ) },
                { key: "note", label: "읽는 법", body: (
                  <>
                    <Box tone="blue">
                      <H>&ldquo;지금 그만두면&rdquo;의 값입니다</H>
                      <p className="text-xs text-gray-700 leading-relaxed">
                        오늘까지의 근속만 반영하므로, 더 다닐수록 커집니다.
                        정년까지 다녔을 때의 금액은 아래 <b>퇴직 시점별 예상 퇴직금</b> 표의 마지막 행을 보세요.
                      </p>
                    </Box>
                    <Box tone="amber">
                      <H>마지막 값만 시점이 다릅니다</H>
                      <p className="text-xs text-gray-700 leading-relaxed">
                        앞의 세 값은 <b>오늘</b> 기준이지만, {payoutAge}세 월 분배금은
                        <b> 만 {DB_ACCESS_AGE}세({accessStr}) 매입 → {currentHoldMonths}개월 재투자 → {payoutAge}세 수령</b>을 거친 뒤의 값입니다.
                        DB형이라 만 {DB_ACCESS_AGE}세 전에는 퇴직연금을 개인이 운용할 수 없어 이 순서를 따릅니다.
                      </p>
                    </Box>
                  </>
                ) },
              ]}
            />
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-blue-400 mb-0.5">세전 퇴직금</p>
              <p className="text-xl font-bold text-blue-800">약 {fmtMan(currentSeverance.grossMan)}</p>
            </div>
            <div>
              <p className="text-xs text-blue-400 mb-0.5">퇴직소득세</p>
              <p className="text-xl font-bold text-red-500">약 {fmtMan(currentSeverance.taxMan)}</p>
            </div>
            <div>
              <p className="text-xs text-blue-400 mb-0.5">실수령액</p>
              <p className="text-xl font-bold text-emerald-700">약 {fmtMan(currentSeverance.netMan)}</p>
            </div>
            <div>
              <p className="text-xs text-blue-400 mb-0.5">{payoutAge}세 월 분배금</p>
              <p className="text-xl font-bold text-indigo-700">약 {fmtMan(currentSeverance.ccMonthlyMan)}</p>
            </div>
          </div>
          <p className="text-[10px] text-blue-300 mt-3">
            급여명세서 지급액 (6,900,000원/월) × 근속일수({tenure.totalDays}일) ÷ 365 기준 · 세금은 2023년 개정 퇴직소득세 기준 근사치
          </p>
        </div>

        {/* 퇴직 시점별 시나리오 테이블 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold text-gray-900">퇴직 시점별 예상 퇴직금</h2>
              <HelpModal
                title="퇴직 시점별 예상 퇴직금"
                lead="어느 해에 그만두면 퇴직금이 얼마인가"
                tabs={[
                  { key: "cols", label: "컬럼 설명", body: (
                    <Box>
                      <ColTable rows={[
                        ["퇴직 시점", <>그 해에 퇴직한다고 가정한 연도. <b>정년</b> 배지가 붙은 행이 {LEGAL_RETIRE_YEAR}년입니다</>],
                        ["근속연수", <>입사 연도(2015)부터의 햇수. 퇴직소득세 공제액을 정하는 값입니다</>],
                        ["평균임금", <>그 해 기준 연봉. 2030년부터 매년 240만원씩 오른다고 봅니다</>],
                        ["세전 퇴직금", <>퇴직소득세를 떼기 전 금액</>],
                        ["퇴직소득세", <>2023년 개정 기준 근사치 (지방소득세 10% 포함)</>],
                        ["실수령액", <>세전 − 세금. 아래 커버드콜 시뮬레이션의 투자 원금이 됩니다</>],
                      ]} />
                    </Box>
                  ) },
                  { key: "read", label: "읽는 법", body: (
                    <>
                      <Box tone="amber">
                        <H>⚠️ 2029 → 2030년 사이가 크게 뜁니다</H>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          두 구간의 계산 방식이 다르기 때문입니다.
                        </p>
                        <ColTable rows={[
                          ["2026~2029", <>법정 퇴직금 공식(연봉 ÷ 12 × 근속연수)으로 <b>추정</b>한 값</>],
                          ["2030~2034", <>사전에 계산해 둔 값. 법정 퇴직금보다 높을 수 있습니다</>],
                        ]} />
                        <p className="text-xs text-gray-500 mt-2">
                          계산 방식이 바뀌는 경계라 그 구간의 증가폭은 의미로 읽지 마세요.
                        </p>
                      </Box>

                      <Box>
                        <H>세율이 아니라 공제가 움직입니다</H>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          퇴직금이 커지면 세금도 늘지만, 근속연수공제·환산급여공제가 함께 커져
                          <b> 실효세율은 완만하게</b> 오릅니다. 오래 다닐수록 세금 면에서 유리한 구조입니다.
                        </p>
                      </Box>
                    </>
                  ) },
                ]}
              />
            </div>
            <p className="text-xs text-gray-400 mt-0.5">매년 240만원 연봉 인상 가정 · 2026~2029년은 법정 퇴직금 추정 · 2030~2034년은 사전 계산값</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                  <th className="px-4 py-3 text-left font-medium">퇴직 시점</th>
                  <th className="px-4 py-3 text-right font-medium">근속</th>
                  <th className="px-4 py-3 text-right font-medium">예상 연봉</th>
                  <th className="px-4 py-3 text-right font-medium">퇴직금 (세전)</th>
                  <th className="px-4 py-3 text-right font-medium">퇴직소득세</th>
                  <th className="px-4 py-3 text-right font-medium">실수령액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tableRows.map((row) => (
                  <tr
                    key={row.year}
                    className={
                      row.isLegal
                        ? "bg-amber-50"
                        : row.year === today.getFullYear()
                        ? "bg-blue-50"
                        : "hover:bg-gray-50"
                    }
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{row.year}년</span>
                        {row.isLegal && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                            정년
                          </span>
                        )}
                        {row.year === today.getFullYear() && (
                          <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">
                            현재
                          </span>
                        )}
                        {!row.isConfirmed && row.year !== today.getFullYear() && (
                          <span className="text-[10px] text-gray-300">추정</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{row.tenureYears}년</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtMan(row.salaryMan)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtMan(row.grossMan)}</td>
                    <td className="px-4 py-3 text-right text-red-400 text-xs">{fmtMan(row.taxMan)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700">{fmtMan(row.netMan)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 퇴직금 커버드콜 운용 시뮬레이션 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold text-gray-900">퇴직금 커버드콜 운용 시 분배금 시뮬레이션</h2>
              <HelpModal
                title="퇴직금 커버드콜 운용 시 분배금"
                lead={`퇴직·만 ${DB_ACCESS_AGE}세 중 늦은 쪽에 매입 → ${payoutAge}세까지 재투자 → 그 뒤 수령`}
                tabs={[
                  { key: "what", label: "이 표가 뭔가요", body: (
                    <>
                      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl px-5 py-4 text-white">
                        <p className="font-bold text-base mb-1">퇴직금을 헐지 않고 분배금만 받는 구조</p>
                        <p className="text-sm text-emerald-50">
                          원금(수량)은 그대로 두고 매달 나오는 분배금만 생활비로 쓰는 시나리오입니다.
                        </p>
                      </div>

                      <Box>
                        <H>시간 순서</H>
                        <div className="space-y-1.5 text-xs">
                          <p><b className="text-gray-700">퇴직 · 만 {DB_ACCESS_AGE}세 중 늦은 쪽</b> — 실수령 퇴직금 전액으로 KODEX 200 타겟위클리커버드콜 매입</p>
                          <p><b className="text-gray-700">~ {payoutAge}세</b> — 분배금 전액 재투자 (정년 퇴직이면 {retireHoldMonths}개월)</p>
                          <p><b className="text-amber-600">{payoutAge}세부터</b> — 재투자를 멈추고 분배금 수령. 수량이 고정되므로 수령액이 유지됩니다</p>
                        </div>
                      </Box>

                      <Box tone="amber">
                        <H>왜 정년부터인가</H>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          <b>DB형이라 정년 전에는 ETF 를 매입할 수 없습니다.</b> 회사가 적립금을 운용하므로
                          퇴직금은 정년에 손에 들어오고, 그 전에 발생하는 분배금도 없습니다.
                          그래서 각 행의 차이는 &ldquo;그 해 퇴직했다면 퇴직금이 얼마인가&rdquo;뿐이고,
                          매입·재투자·수령 시점은 <b>모든 행이 같습니다.</b>
                        </p>
                      </Box>
                    </>
                  ) },
                  { key: "cols", label: "컬럼 설명", body: (
                    <Box>
                      <ColTable rows={[
                        ["투자 원금", <>그 해 퇴직 시 실수령액. 정년에 이 금액으로 매입한다고 봅니다</>],
                        [`${payoutAge}세 평가액`, <>재투자로 불어난 금액. 주가는 현재가 고정(상승률 0%)이라
                          분배금만큼만 늘어납니다 — 정년 퇴직 기준 {retireHoldMonths}개월이면 약 <b>{Math.pow(1 + ccAnnualRate / 12, retireHoldMonths).toFixed(2)}배</b></>],
                        ["월 분배금", <>평가액 × 연 분배율 ÷ 12</>],
                        ["연 분배금", <>평가액 × 연 분배율</>],
                      ]} />
                    </Box>
                  ) },
                  { key: "tax", label: "세금", body: (
                    <>
                      <Box tone="emerald">
                        <H>세금을 계산에 넣지 않았습니다</H>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          커버드콜 분배금은 대부분 <b>파생상품 매매이익</b>이라 국내 주식형 ETF 기준으로 비과세입니다.
                          실제 과세 대상은 운용사가 공시하는 <b>주당 과세표준액</b>뿐인데,
                          최근 12회 기준 분배금의 <b>4~5%</b> 수준입니다.
                          배당소득세 15.4%를 그 4~5%에만 매기므로 <b>실효세율이 1%에 못 미칩니다.</b>
                          표를 어지럽힐 뿐이라 계산에서 제외했습니다.
                        </p>
                      </Box>

                      <Box>
                        <H>금융소득종합과세도 사실상 무관합니다</H>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          연 2,000만원 기준은 <b>과세표준액</b>으로 따집니다.
                          과표 비율이 4~5%라면 연 분배금이 <b>5억에 가까워야</b> 그 선에 닿습니다.
                          평가액으로 환산하면 30억 규모라, 이 표의 어느 행도 해당되지 않습니다.
                        </p>
                      </Box>

                      <Box tone="amber">
                        <H>⚠️ 다만 고정된 성질은 아닙니다</H>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          과표 비율은 회차마다 0%~16%로 흔들리고, 운용사가 분배 재원 구성을 바꾸면
                          과세 대상이 크게 늘 수 있습니다. 세법이 바뀔 가능성도 있습니다.
                          지금 구조에서 무시할 만하다는 뜻이지, 세금이 없다는 뜻은 아닙니다.
                        </p>
                      </Box>
                    </>
                  ) },
                  { key: "limit", label: "⚠️ 주의", body: (
                    <Box tone="amber">
                      <H>⚠️ 깔려 있는 가정</H>
                      <ul className="text-xs text-gray-700 space-y-2 list-disc pl-4 leading-relaxed">
                        <li><b>분배율이 유지된다고 봤습니다.</b> 최근 12회 평균(연 {(ccAnnualRate * 100).toFixed(1)}%)을
                          재투자 기간(최대 {payoutIdx - accessIdx}개월) 내내 곱합니다. 회차별 편차가 커서 오차가 누적됩니다.</li>
                        <li><b>세금을 빼고 계산했습니다.</b> 실효세율이 1% 미만이라 무시했지만,
                          과표 비율이나 세법이 바뀌면 달라집니다.</li>
                        <li><b>주가 변동이 없습니다.</b> 떨어지면 평가액이 줄고 분배금도 함께 줍니다.</li>
                        <li><b>상품이 청산되거나</b> 분배 정책이 바뀔 수 있습니다.</li>
                        <li><b>물가를 반영하지 않았습니다.</b></li>
                        <li><b>IRP 를 쓰지 않는 전제</b>입니다. 이전하면 퇴직소득세가 줄어 투자 원금이 더 커집니다.</li>
                      </ul>
                    </Box>
                  ) },
                ]}
              />
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              실수령 퇴직금 전액으로 KODEX 200 타겟위클리커버드콜 매입 →
              <b className="text-gray-500"> {payoutAge}세까지 분배금 전액 재투자</b> →
              <b className="text-amber-600"> {payoutAge}세부터 분배금 수령</b> ·
              매입은 <b className="text-gray-500">퇴직 시점과 만 {DB_ACCESS_AGE}세({accessStr}) 중 늦은 쪽</b>부터
            </p>
          </div>

          {/* 운용 기준 */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-semibold text-emerald-800">KODEX 200 타겟위클리커버드콜 100%</p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    IRP·ISA 는 운용하지 않으므로 일시금 수령 후 일반 계좌에서 운용하는 기준입니다.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-emerald-600">연 분배율</p>
                  <p className="text-lg font-bold text-emerald-700 tabular-nums">
                    {(ccAnnualRate * 100).toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-emerald-500">
                    {ccRate ? `최근 ${ccRate.count}회 평균` : "기본 추정치"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs">
                  <th className="px-4 py-2 text-left font-medium text-gray-500" rowSpan={2}>퇴직 시점</th>
                  <th className="px-4 py-2 text-center font-semibold text-gray-600 border-l border-gray-200" colSpan={4}>
                    매입 후 {payoutAge}세까지 재투자
                  </th>
                  <th className="px-4 py-2 text-center font-semibold text-amber-700 bg-amber-50 border-l border-gray-200" colSpan={2}>
                    {payoutAge}세부터 매달 수령
                  </th>
                </tr>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                  <th className="px-4 py-2 text-right font-medium border-l border-gray-200">투자 원금</th>
                  <th className="px-4 py-2 text-right font-medium">매입 시점</th>
                  <th className="px-4 py-2 text-right font-medium">재투자</th>
                  <th className="px-4 py-2 text-right font-medium">{payoutAge}세 평가액</th>
                  <th className="px-4 py-2 text-right font-medium bg-amber-50 border-l border-gray-200">월 분배금</th>
                  <th className="px-4 py-2 text-right font-medium bg-amber-50">연 분배금</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ccRows.map(row => (
                  <tr
                    key={row.year}
                    className={
                      row.isLegal
                        ? "bg-amber-50"
                        : row.year === today.getFullYear()
                        ? "bg-blue-50"
                        : "hover:bg-gray-50"
                    }
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{row.year}년</span>
                        {row.isLegal && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">정년</span>
                        )}
                        {row.year === today.getFullYear() && (
                          <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">현재</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs border-l border-gray-100">{fmtMan(row.netMan)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-gray-500 text-xs">{row.buyYm}</span>
                      {row.waiting && (
                        <span className="ml-1 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">만 {DB_ACCESS_AGE}세</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-gray-500 text-xs">{row.holdMonths}개월</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-gray-600">{fmtMan(row.valueMan)}</span>
                    </td>

                    <td className="px-4 py-3 text-right bg-amber-50/60 border-l border-gray-200">
                      <span className="font-bold text-amber-700">{fmtMan(row.monthlyDist)}</span>
                      <span className="text-xs text-gray-400">/월</span>
                    </td>
                    <td className="px-4 py-3 text-right bg-amber-50/60">
                      <span className="font-bold text-blue-700">{fmtMan(row.yearlyDist)}</span>
                      <span className="text-xs text-gray-400">/년</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 text-[11px] text-gray-400 space-y-1">
            <p>• 분배율은 실제 지급 이력 최근 12회 평균 · 개인연금 화면과 같은 데이터</p>
            <p>• 원금(수량)은 헐지 않고 분배금만 받는 구조 — 주가가 오르내려도 수량은 유지된다</p>
            <p>
              • <span className="text-gray-500 font-medium">세금은 계산에 넣지 않았다.</span>{" "}
              커버드콜 분배금은 대부분 파생상품 매매이익이라 실제 과세 대상(과세표준액)이 분배금의 4~5%뿐이고,
              금융소득종합과세(연 2,000만원)도 그 기준이면 연 분배금이 5억에 가까워야 걸린다
            </p>
            <p>
              • <b>DB형이라 매입 시점에 두 가지 제약이 걸린다.</b>
              ① 퇴직 전에는 회사가 적립금을 운용하므로 손댈 수 없고,
              ② 만 {DB_ACCESS_AGE}세({accessStr}) 전에는 퇴직연금을 수령해 개인이 운용할 수 없다 —
              그래서 매입 시점은 <b>둘 중 늦은 쪽</b>이다
            </p>
            <p>
              • 만 {DB_ACCESS_AGE}세 전에 퇴직하는 행은 <span className="text-gray-500">만 {DB_ACCESS_AGE}세</span> 배지가 붙는다.
              퇴직금은 그 해에 받지만 {accessStr}까지 굴리지 못하고 기다리는 경우다
            </p>
            <p>• 각 행은 그 해 <b>{retireMonth}월</b>(정년월)에 퇴직한다고 가정 — 행 간 개월 차이가 정확히 12의 배수가 된다</p>
            <p>• 주가는 현재가 고정(상승률 0%)이라 평가액은 재투자한 분배금만큼만 늘어난다 — 정년 퇴직 기준 {retireHoldMonths}개월이면 약 {Math.pow(1 + ccAnnualRate / 12, retireHoldMonths).toFixed(2)}배</p>
            <p>• 주가가 떨어지면 평가액이 줄고, 같은 분배율이어도 분배금이 함께 줄어든다</p>
          </div>
        </div>

        {/* 계산 가정 및 주의사항 */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 space-y-1.5">
          <p className="font-medium text-gray-600 mb-2">계산 가정 및 주의사항</p>
          <p>• 연봉 인상: 매년 240만원 균등 인상 가정</p>
          <p>• 퇴직금 기준: DB형(확정급여형) 기준으로 퇴직 시점 직전 평균임금 × 근속연수 방식</p>
          <p>• 세금: 2023년 개정 퇴직소득세 기준 (근속연수공제 · 환산급여공제 적용), 지방소득세 10% 포함</p>
          <p>• 2030~2034년은 사전 계산값(법정 퇴직금보다 높을 수 있음), 2026~2029년은 법정 퇴직금 공식(연봉÷12×근속연수) 적용 추정치</p>
          <p>• 2029→2030년 사이 금액 차이가 크게 보일 수 있으며, 이는 두 구간의 계산 방식이 다르기 때문입니다</p>
          <p>• 실제 퇴직금은 운용수익, 중도인출, 회사 정책 등에 따라 달라질 수 있습니다</p>
          <p>• IRP·ISA 는 운용 계획이 없어 다루지 않습니다. 퇴직금을 IRP 로 이전하면 퇴직소득세가 이연·감면되지만, 이 화면은 일시금 수령 후 일반 계좌에서 운용하는 기준입니다</p>
        </div>

      </div>
    </AppLayout>
  )
}
