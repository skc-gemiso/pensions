"use server"

import { getPensionPool } from "@/lib/pension-db"
import { requireAdmin } from "@/lib/guard"
import { getProfile } from "@/app/actions/profile"
import { perSettingsFromEnv, retSettingsFromEnv } from "@/lib/settings"
import { ageOn, ymAtAge, retireEndYm } from "@/lib/profile"
import { simulatePer } from "@/lib/pension-per-calc"
import {
  buildRetirementRows, calcCurrentSeverance, calcTenure, grownValue, toDate,
  avgMonthlyWage, CC_STOCK_CODE, CC_FALLBACK_ANNUAL_RATE,
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
  const ret = retSettingsFromEnv()
  const joinDate = toDate(profile.join_date)
  const retireDate = toDate(profile.retire_date)
  const retRows = buildRetirementRows(
    now.getFullYear(), retireDate.getFullYear(), ret, joinDate, retireDate
  )
  const retireRow = retRows.find(r => r.isLegal)
  const retireNetMan = retireRow?.netMan ?? 0

  const retireIdx = idxOf(profile.retire_date.slice(0, 7))
  const payoutIdx = birthIdx + cfg.payout_age * 12
  const retHoldMonths = Math.max(0, payoutIdx - retireIdx)
  const retValueMan = grownValue(retireNetMan, ccAnnualRate, retHoldMonths)
  const retMonthly = Math.round(retValueMan * ccAnnualRate / 12) * 10_000

  const tenure = calcTenure(joinDate, now)
  const retCurrent = calcCurrentSeverance(avgMonthlyWage(ret), tenure.totalDays)
  const retTotalDays = Math.floor((retireDate.getTime() - joinDate.getTime()) / 86_400_000)

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

// ── 월별 과거 실적 추이 ────────────────────────────────────────────────────────

/** 추이 탭 — 세 연금 + 합계 */
export type HistoryKind = PensionKind | "all"

export type HistoryRow = {
  ym: string
  /** 연금별 부가 지표 — 개인=보유수량(주), 국민=총 납부액(원). 퇴직연금은 없다 */
  base: number | null
  /** 월 수령액 (원) — 세 연금을 같은 축에 놓는 값 */
  monthly: number
  /** 직전 시점 대비 월 수령액 증감 */
  diff: number | null
  diffPct: number | null
  /** 합계 탭에서만 — 그 달의 연금별 내역 */
  parts?: { per: number; ret: number; nat: number; natEstimated: boolean }
}

export type PensionHistory = {
  kind: HistoryKind
  /** 부가 지표 컬럼명 — null 이면 그 컬럼을 그리지 않는다 */
  baseLabel: string | null
  /** base 의 단위 — 표기 방식이 달라진다 */
  baseUnit: "shares" | "won" | "pct" | null
  /** 월 수령액 컬럼명 — 연금마다 성격이 달라 이름이 다르다 */
  monthlyLabel: string
  /** 그 월 수령액이 어떤 전제로 나온 값인지 — 카드의 값과 기준이 달라 반드시 밝힌다 */
  basisNote: string
  rows: HistoryRow[]
  /** 첫 행 대비 마지막 행 변화율(%) */
  changePct: number | null
  /** 실제 데이터 범위 설명 */
  rangeLabel: string
}

/** 퇴직연금 추이를 몇 개월 보여줄지 — 계산은 무한정 가능하지만 최근 것만 쓴다 */
const RET_HISTORY_MONTHS = 12

/** 직전 행 대비 증감을 채운다. rows 는 오름차순이어야 한다 */
function withDiff(rows: Omit<HistoryRow, "diff" | "diffPct">[]): HistoryRow[] {
  return rows.map((r, i) => {
    const prev = i > 0 ? rows[i - 1].monthly : null
    return {
      ...r,
      diff: prev == null ? null : r.monthly - prev,
      diffPct: prev == null || prev === 0 ? null : ((r.monthly - prev) / prev) * 100,
    }
  })
}

function pctChange(rows: HistoryRow[]): number | null {
  if (rows.length < 2) return null
  const first = rows[0].monthly
  if (first === 0) return null
  return ((rows[rows.length - 1].monthly - first) / first) * 100
}

const dotYm = (ym: string) => ym.replace("-", ".")

/**
 * 세 연금의 과거 실적 추이.
 *
 * 새 테이블을 만들지 않고 기존 데이터로 재구성한다. 연금마다 성질이 달라
 * **범위와 촘촘함이 다르다** — 억지로 맞추지 않고 각자의 범위를 그대로 쓴다.
 *   개인연금  매수 내역 × 월말 종가 → 그 시점에 예상했던 월 수령액
 *   퇴직연금  근속일수 기반 재계산 → 월 단위, 최근 12개월만
 *   국민연금  공단 확인 스냅샷      → 월 단위가 아님 (보간하지 않는다)
 *
 * 세 연금 모두 **월 수령액**을 공통 축으로 삼고, 증감도 그 값 기준으로 낸다.
 * 요약(getPensionOverview)과 분리해 둔다. 화면 첫 페인트를 막지 않기 위해서다.
 */
export async function getPensionHistory(): Promise<PensionHistory[]> {
  await requireAdmin()

  const pool = getPensionPool()
  const profile = await getProfile()
  const cfg = perSettingsFromEnv()

  // 분배율도 그 달 시점의 값으로 되살린다. 요약 카드가 "최근 12회 평균"을 쓰므로,
  // 과거 달도 그 달까지의 12회 평균을 쓰면 "그때 이 화면을 봤다면 나왔을 값"이 된다.
  const { rows: divRows } = await pool.query<{ ref_date: Date; dist_rate: number }>(`
    SELECT ref_date, dist_rate::float8 AS dist_rate FROM t_etf_dividend
    WHERE stock_code = $1 ORDER BY ref_date
  `, [CC_STOCK_CODE])

  /** 기준일까지의 최근 12회 평균 월 분배율. 이력이 없으면 대체값 */
  function monthlyRateAt(on: Date): number {
    const past = divRows.filter(r => r.ref_date <= on).slice(-12)
    if (past.length === 0) return CC_FALLBACK_ANNUAL_RATE / 12
    return past.reduce((s, r) => s + Number(r.dist_rate), 0) / past.length / 100
  }
  /** 'YYYY-MM' 의 말일 — 그 달까지 확정된 분배만 반영하려고 쓴다 */
  const endOfMonth = (ym: string) => {
    const [y, m] = ym.split("-").map(Number)
    return new Date(y, m, 0, 23, 59, 59)
  }

  // ── 개인연금 — 월말 거래일의 누적 순수량 × 그날 종가로 그때의 예상을 재현 ──
  const { rows: perRows } = await pool.query<{ ym: string; price: number; quantity: number }>(`
    WITH months AS (
      SELECT TO_CHAR(e_date, 'YYYY-MM') AS ym, MAX(e_date) AS eom
      FROM t_stock_amt WHERE stock_code = $2
      GROUP BY 1
    )
    SELECT m.ym,
           a.e_amt::float8 AS price,
           (SELECT COALESCE(SUM(s.qty), 0) FROM my_stock s
            WHERE s.account_no = $1 AND s.stock_code = $2
              AND TO_DATE(s.s_date, 'YYYYMMDD') <= m.eom)::float8 AS quantity
    FROM months m
    JOIN t_stock_amt a ON a.stock_code = $2 AND a.e_date = m.eom
    ORDER BY m.ym
  `, [cfg.account_no, cfg.stock_code])

  const perPayoutYm = ymAtAge(profile.birth_date, cfg.payout_age)
  const perRetireYm = retireEndYm(profile)

  // 아직 보유가 없던 달은 버린다 — 0 구간이 앞에 길게 붙으면 추이가 안 보인다
  const perHistory = withDiff(
    perRows
      .filter(r => Number(r.quantity) > 0)
      .map(r => {
        const quantity = Number(r.quantity)
        const price = Number(r.price)
        const sim = simulatePer({
          quantity, price,
          monthlyRate: monthlyRateAt(endOfMonth(r.ym)),
          monthlyAmount: cfg.monthly_amount,
          startYm: r.ym,
          retireYm: perRetireYm,
          payoutYm: perPayoutYm,
        })
        return { ym: r.ym, base: Math.round(quantity), monthly: sim.monthlyPayout }
      })
  )

  // ── 퇴직연금 — 요약 카드와 완전히 같은 기준 (정년 퇴직금 × 거치) ──────────
  // 원금(회사 사전 계산값)도 거치 개월도 고정이라, 달마다 변하는 값은 분배율뿐이다.
  // 그래서 이 표의 증감은 곧 "분배율이 움직인 만큼"이다.
  const retireDate = toDate(profile.retire_date)
  const retireNetMan = buildRetirementRows(
    new Date().getFullYear(), retireDate.getFullYear(),
    retSettingsFromEnv(), toDate(profile.join_date), retireDate,
  ).find(r => r.isLegal)?.netMan ?? 0
  const retHoldMonths = Math.max(
    0,
    idxOf(profile.birth_date.slice(0, 7)) + cfg.payout_age * 12 - idxOf(profile.retire_date.slice(0, 7))
  )

  const now = new Date()
  const retSeries: { ym: string; base: number | null; monthly: number }[] = []
  for (let i = RET_HISTORY_MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0) // 그 달 말일
    if (d > now) d.setTime(now.getTime())                            // 이번 달은 오늘까지
    const annual = monthlyRateAt(d) * 12
    const valueMan = grownValue(retireNetMan, annual, retHoldMonths)
    retSeries.push({
      ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      base: annual * 100,
      monthly: Math.round(valueMan * annual / 12) * 10_000,
    })
  }
  const retHistory = withDiff(retSeries)

  // ── 국민연금 — 확인 스냅샷 그대로. 월 단위가 아니라 보간하지 않는다 ───────
  const { rows: natRows } = await pool.query<{
    check_date: string; total_premium: string; monthly_net: string
  }>(`
    SELECT check_date, total_premium, monthly_net FROM np_snapshots ORDER BY check_date
  `)
  const natHistory = withDiff(natRows.map(r => ({
    ym: r.check_date.replace(/\./g, "-").slice(0, 7),
    base: Number(r.total_premium),
    monthly: Number(r.monthly_net),
  })))

  // ── 합계 — 세 연금이 모두 값을 갖는 달만 ──────────────────────────────────
  // 한 연금이 중간에 끼어들면 합계가 껑충 뛰어 추세가 아니라 착시가 된다.
  // 국민연금만 확인 시점이 드물어 예외적으로 보간한다 (아래 natAt 참고).
  const natSnaps = natHistory.map(r => ({ idx: idxOf(r.ym), value: r.monthly }))

  /**
   * 국민연금 월 수령 예상액을 그 달 기준으로 추정한다.
   *   확인 시점 사이  → 직선 보간
   *   마지막 확인 이후 → 마지막 값 유지 (없는 상승을 지어내지 않는다)
   *   첫 확인 이전    → 없음
   */
  function natAt(ym: string): { value: number; estimated: boolean } | null {
    if (natSnaps.length === 0) return null
    const at = idxOf(ym)
    const exact = natSnaps.find(s => s.idx === at)
    if (exact) return { value: exact.value, estimated: false }
    if (at < natSnaps[0].idx) return null
    const last = natSnaps[natSnaps.length - 1]
    if (at > last.idx) return { value: last.value, estimated: true }
    const hi = natSnaps.findIndex(s => s.idx > at)
    const a = natSnaps[hi - 1], b = natSnaps[hi]
    const t = (at - a.idx) / (b.idx - a.idx)
    return { value: Math.round(a.value + (b.value - a.value) * t), estimated: true }
  }

  const perMap = new Map(perHistory.map(r => [r.ym, r.monthly]))
  const retMap = new Map(retHistory.map(r => [r.ym, r.monthly]))
  const allSeries: Omit<HistoryRow, "diff" | "diffPct">[] = []
  for (const ym of [...perMap.keys()].sort()) {
    const ret = retMap.get(ym)
    const nat = natAt(ym)
    if (ret == null || nat == null) continue
    const per = perMap.get(ym)!
    allSeries.push({
      ym, base: null,
      monthly: per + ret + nat.value,
      parts: { per, ret, nat: nat.value, natEstimated: nat.estimated },
    })
  }
  const allHistory = withDiff(allSeries)
  const natEstimatedCount = allHistory.filter(r => r.parts?.natEstimated).length

  const range = (rows: HistoryRow[]) =>
    rows.length === 0 ? "데이터 없음"
      : rows.length === 1 ? dotYm(rows[0].ym)
      : `${dotYm(rows[0].ym)} → ${dotYm(rows[rows.length - 1].ym)}`

  return [
    {
      kind: "all",
      baseLabel: null, baseUnit: null, monthlyLabel: "합계",
      basisNote: `그 달에 이 화면을 봤다면 나왔을 ${cfg.payout_age}·${NAT_PAYOUT_AGE}세 수령액입니다. `
        + "세 연금이 모두 값을 갖는 달만 담습니다 — 하나가 중간에 끼어들면 합계가 껑충 뛰어 추세가 아니라 착시가 됩니다"
        + (natEstimatedCount > 0 ? ". 국민연금 * 는 확인 시점 사이를 보간한 추정치" : ""),
      rows: allHistory, changePct: pctChange(allHistory), rangeLabel: range(allHistory),
    },
    {
      kind: "per",
      baseLabel: "보유 수량", baseUnit: "shares", monthlyLabel: "월 수령액 예상",
      basisNote: `그 달의 보유수량·주가·분배율로 다시 계산한 ${cfg.payout_age}세 예상 수령액입니다`,
      rows: perHistory, changePct: pctChange(perHistory), rangeLabel: range(perHistory),
    },
    {
      kind: "ret",
      baseLabel: "연 분배율", baseUnit: "pct", monthlyLabel: "월 분배금",
      basisNote: `정년(${dotYm(profile.retire_date.slice(0, 7))}) 퇴직금을 ${cfg.payout_age}세까지 굴리는 기준 — `
        + "원금도 거치 기간도 고정이라, 달마다 변하는 값은 분배율뿐입니다",
      rows: retHistory, changePct: pctChange(retHistory),
      rangeLabel: retHistory.length > 1 ? `최근 ${retHistory.length}개월` : range(retHistory),
    },
    {
      kind: "nat",
      baseLabel: "총 납부액", baseUnit: "won", monthlyLabel: "월 수령 예상 (세후)",
      basisNote: "공단이 통보한 값 그대로입니다 — 확인한 시점에만 기록이 남습니다",
      rows: natHistory, changePct: pctChange(natHistory),
      rangeLabel: natHistory.length > 1 ? `확인 ${natHistory.length}회 · ${range(natHistory)}` : range(natHistory),
    },
  ]
}
