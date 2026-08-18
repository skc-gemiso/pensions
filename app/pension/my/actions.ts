"use server"

import { getPensionPool } from "@/lib/pension-db"
import { requireAdmin } from "@/lib/guard"
import { getProfile } from "@/app/actions/profile"
import { perSettingsFromEnv } from "@/lib/settings"
import { ageOn, ymAtAge, retireEndYm } from "@/lib/profile"
import { simulatePer } from "@/lib/pension-per-calc"
import {
  buildRetirementRows, calcCurrentSeverance, calcTenure, grownValue, toDate,
  CC_STOCK_CODE, CC_FALLBACK_ANNUAL_RATE, MONTHLY_SALARY_WON,
} from "@/lib/pension-ret-calc"

/** 국민연금 개시 나이 — 1969년 이후 출생자 기준 */
const NAT_PAYOUT_AGE = 65
/** 국민연금 가입 시작 (2007-11) */
const NAT_START_YM = "2007-11"
/** 국민연금 총 납부 예정 개월 */
const NAT_TOTAL_MONTHS = 319

export type PensionKind = "nat" | "ret" | "per"

export type PensionSummary = {
  kind: PensionKind
  label: string
  href: string
  /** 지금까지 쌓인 금액 (원) */
  accumulated: number
  accumulatedLabel: string
  /** 수령 개시 후 월 수령액 (원) */
  monthly: number
  /** 수령 개시 'YYYY-MM' */
  startYm: string
  /** 수령 개시 나이 */
  startAge: number
  /** 실적치인지 예상치인지 */
  basis: string
  /** 진행률 0~100 (적립 진행) */
  progressPct: number
  progressLabel: string
}

/** 나이 구간별 월 합산 수령액 */
export type PayoutStage = {
  fromYm: string
  fromAge: number
  /** 연금별 월 수령액 (원) */
  nat: number
  ret: number
  per: number
  total: number
  /** 이 구간에서 새로 시작하는 연금 */
  starting: PensionKind[]
}

export type PensionOverview = {
  today: string
  currentAge: number
  birthDate: string
  retireDate: string
  pensions: PensionSummary[]
  stages: PayoutStage[]
  /** 전부 수령할 때의 월 합계 */
  peakMonthly: number
  /** 커버드콜 연 분배율 (0.1713) — 퇴직·개인연금 공통 전제 */
  ccAnnualRate: number
}

function ymOf(idx: number): string {
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`
}
function idxOf(ym: string): number {
  const [y, m] = ym.split("-").map(Number)
  return y * 12 + (m - 1)
}

export async function getPensionOverview(): Promise<PensionOverview> {
  await requireAdmin()

  const pool = getPensionPool()
  const profile = await getProfile()
  const cfg = perSettingsFromEnv()

  const now = new Date()
  const todayYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const currentAge = ageOn(profile.birth_date, `${todayYm}-01`)
  const birthIdx = idxOf(profile.birth_date.slice(0, 7))

  // ── 공통 전제: 커버드콜 분배율 (최근 12회 평균) ──────────────────────────
  const { rows: dr } = await pool.query<{ rate: number }>(`
    SELECT COALESCE(AVG(dist_rate), 0)::float8 AS rate FROM (
      SELECT dist_rate FROM t_etf_dividend WHERE stock_code = $1
      ORDER BY ref_date DESC LIMIT 12
    ) t
  `, [CC_STOCK_CODE])
  const monthlyRate = Number(dr[0]?.rate ?? 0) / 100
  const ccAnnualRate = monthlyRate > 0 ? monthlyRate * 12 : CC_FALLBACK_ANNUAL_RATE

  // ── 국민연금 — 최신 스냅샷이 실적치다 ───────────────────────────────────
  const { rows: np } = await pool.query<{ total_premium: number; monthly_net: number }>(`
    SELECT total_premium, monthly_net FROM np_snapshots ORDER BY check_date DESC LIMIT 1
  `)
  const natMonthly = Number(np[0]?.monthly_net ?? 0)
  const natPremium = Number(np[0]?.total_premium ?? 0)
  const natStartYm = ymAtAge(profile.birth_date, NAT_PAYOUT_AGE)
  const natPaidMonths = Math.max(0, Math.min(NAT_TOTAL_MONTHS, idxOf(todayYm) - idxOf(NAT_START_YM)))

  // ── 퇴직연금 — 정년 퇴직금을 커버드콜로 굴려 수령 개시 나이부터 받는다 ──
  const retRows = buildRetirementRows(now.getFullYear(), toDate(profile.retire_date).getFullYear())
  const retireRow = retRows.find(r => r.isLegal)
  const retireNetMan = retireRow?.netMan ?? 0

  const retireIdx = idxOf(profile.retire_date.slice(0, 7))
  const payoutIdx = birthIdx + cfg.payout_age * 12
  const retHoldMonths = Math.max(0, payoutIdx - retireIdx)
  const retValueMan = grownValue(retireNetMan, ccAnnualRate, retHoldMonths)
  const retMonthly = Math.round(retValueMan * ccAnnualRate / 12) * 10_000

  const tenure = calcTenure(toDate(profile.join_date), now)
  const retCurrent = calcCurrentSeverance(MONTHLY_SALARY_WON, tenure.totalDays)
  const retTotalDays = Math.floor(
    (toDate(profile.retire_date).getTime() - toDate(profile.join_date).getTime()) / 86_400_000
  )

  // ── 개인연금 — 연금저축펀드 적립 + 분배금 재투자 ────────────────────────
  const { rows: hold } = await pool.query<{ quantity: number }>(`
    SELECT COALESCE(SUM(qty), 0)::float8 AS quantity FROM my_stock
    WHERE account_no = $1 AND stock_code = $2
  `, [cfg.account_no, cfg.stock_code])
  const { rows: px } = await pool.query<{ price: number }>(`
    SELECT e_amt::float8 AS price FROM t_stock_amt
    WHERE stock_code = $1 ORDER BY e_date DESC LIMIT 1
  `, [cfg.stock_code])

  const quantity = Number(hold[0]?.quantity ?? 0)
  const price = Number(px[0]?.price ?? 0)
  const perValue = Math.round(quantity * price)
  const perPayoutYm = ymAtAge(profile.birth_date, cfg.payout_age)
  const perResult = simulatePer({
    quantity, price, monthlyRate,
    monthlyAmount: cfg.monthly_amount,
    startYm: todayYm,
    retireYm: retireEndYm(profile),
    payoutYm: perPayoutYm,
  })
  const perMonthsLeft = Math.max(0, payoutIdx - idxOf(todayYm))

  const pensions: PensionSummary[] = [
    {
      kind: "per", label: "개인연금", href: "/pension/per",
      accumulated: perValue,
      accumulatedLabel: "연금저축펀드 평가액",
      monthly: perResult.monthlyPayout,
      startYm: perPayoutYm, startAge: cfg.payout_age,
      basis: "적립 + 분배금 재투자 (예상)",
      progressPct: perResult.finalValue > 0
        ? Math.min(100, Math.round(perValue / perResult.finalValue * 100))
        : 0,
      progressLabel: `${cfg.payout_age}세 목표 평가액 대비 · ${perMonthsLeft}개월 남음`,
    },
    {
      kind: "ret", label: "퇴직연금", href: "/pension/ret",
      accumulated: retCurrent.netMan * 10_000,
      accumulatedLabel: "현재 기준 실수령 퇴직금",
      monthly: retMonthly,
      startYm: ymOf(payoutIdx), startAge: cfg.payout_age,
      basis: "정년 퇴직금 커버드콜 운용 (예상)",
      progressPct: Math.min(100, Math.round(tenure.totalDays / Math.max(1, retTotalDays) * 100)),
      progressLabel: `근속 ${tenure.years}년 ${tenure.months}개월 / 정년 ${profile.retire_date.slice(0, 7).replace("-", ".")}`,
    },
    {
      kind: "nat", label: "국민연금", href: "/pension/nat",
      accumulated: natPremium,
      accumulatedLabel: "총 납부 보험료",
      monthly: natMonthly,
      startYm: natStartYm, startAge: NAT_PAYOUT_AGE,
      basis: "공단 예상 수령액 (세후)",
      progressPct: Math.round(natPaidMonths / NAT_TOTAL_MONTHS * 100),
      progressLabel: `납부 ${natPaidMonths} / ${NAT_TOTAL_MONTHS}개월`,
    },
  ]

  // ── 수령 시점별 합산 ────────────────────────────────────────────────────
  const marks = Array.from(new Set(pensions.map(p => p.startYm))).sort()
  const stages: PayoutStage[] = marks.map(ym => {
    const active = pensions.filter(p => p.startYm <= ym)
    const sum = (k: PensionKind) => active.find(p => p.kind === k)?.monthly ?? 0
    return {
      fromYm: ym,
      fromAge: ageOn(profile.birth_date, `${ym}-01`),
      nat: sum("nat"), ret: sum("ret"), per: sum("per"),
      total: active.reduce((s, p) => s + p.monthly, 0),
      starting: pensions.filter(p => p.startYm === ym).map(p => p.kind),
    }
  })

  return {
    today: todayYm,
    currentAge,
    birthDate: profile.birth_date,
    retireDate: profile.retire_date,
    pensions,
    stages,
    peakMonthly: stages.length > 0 ? stages[stages.length - 1].total : 0,
    ccAnnualRate,
  }
}
