import type { Pool } from "pg"

/**
 * 적립 스냅샷 — 평균 매입가로 구간 매입을 역산한다.
 *
 * 나무증권 주식모으기는 매일 자동 매수해서 체결을 날마다 넣을 수 없다.
 * 대신 가끔 **보유수량 · 평균매입가 · 계좌잔액** 세 값을 넣으면
 * 직전 상태와의 차이로 그 구간의 매입을 **정확히** 복원할 수 있다.
 *
 *   구간 매입금액 = (수량₂ × 평균가₂) − (수량₁ × 평균가₁)
 *   구간 매입수량 = 수량₂ − 수량₁
 *
 * 평균 매입가가 "총 매입원가 ÷ 보유수량" 이라 총 원가를 복원할 수 있어서다.
 * 근사치가 아니라 정확한 값이다.
 *
 * 서버 전용 모듈. 클라이언트 컴포넌트에서 import 하지 않는다.
 */

export type SnapshotInput = {
  account_no: string
  stock_code: string
  /** YYYY-MM-DD */
  snap_date: string
  /** 증권사 화면의 보유 수량 */
  qty: number
  /** 증권사 화면의 평균 매입가(원) */
  avg_price: number
  /** 증권사 화면의 계좌 예수금(원). 비우면 잔액 보정을 건너뛴다 */
  balance: number | null
}

export type PlannedBuy = {
  /** YYYYMMDD */
  s_date: string
  qty: number
  s_amt: number
  fund_type: number      // 1=현금, 2=분배금
  /** 기산일 몫인지 — 분배금 대상 수량에 잡히는 행 */
  is_base_day: boolean
}

export type SnapshotPlan = {
  account_no: string
  stock_code: string
  /** 직전 상태 */
  prev_qty: number
  prev_cost: number
  /** 이번 구간 */
  add_qty: number
  add_cost: number
  unit_price: number
  /** 기산일을 가로질러 쪼갠 경우 그 날짜 (YYYY-MM-DD), 아니면 null */
  base_date: string | null
  /**
   * 분할 비율의 근거.
   * `trading` 실제 거래일 수 (정확) / `weekday` 평일 수 (주가 미수집 구간, 공휴일 못 걸러 추정)
   */
  split_basis: "trading" | "weekday" | null
  buys: PlannedBuy[]
  /** 자금 구분 안분 근거 — 구간 입금 구성 */
  inflow_cash: number
  inflow_div: number
  /** 잔액 검증 */
  expected_balance: number | null
  actual_balance: number | null
  balance_gap: number | null
  /** 막아야 하는 사유. 비어 있으면 저장 가능 */
  errors: string[]
}

const ymd = (d: string) => d.replace(/-/g, "")

/**
 * 구간 `(from, to]` 안에 드는 기산일(매월 baseDay) 중 **마지막 것**.
 *
 * 달력으로 센다 — 기산일이 휴장일이거나 아직 주가가 안 들어온 미래 구간이어도
 * 분할 판정이 되어야 하기 때문이다. `from` 이 null 이면 to 가 속한 달만 본다.
 */
/**
 * `(from, to]` 의 평일(월~금) 수. `from` 이 null 이면 `to` 하루만 센다.
 *
 * 주가가 아직 안 들어온 구간에서 거래일 수 대신 쓴다. 공휴일까지는 못 걸러내지만
 * 달력일로 세는 것보다 훨씬 가깝다 — 주말이 2/7 이라 오차가 크다.
 */
function countWeekdays(from: string | null, to: string): number {
  const mk = (s: string) => new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8))
  const end = mk(to)
  const cur = from ? mk(from) : new Date(end)
  cur.setDate(cur.getDate() + 1)      // from 은 제외, to 는 포함
  let n = 0
  while (cur <= end) {
    const w = cur.getDay()
    if (w !== 0 && w !== 6) n++
    cur.setDate(cur.getDate() + 1)
  }
  return n
}

function lastBaseDayIn(from: string | null, to: string, baseDay: number): string | null {
  const dd = String(baseDay).padStart(2, "0")
  let y = Number(to.slice(0, 4))
  let m = Number(to.slice(4, 6))
  // 최대 24개월만 거슬러 본다 (구간이 그보다 길면 어차피 첫 스냅샷이다)
  for (let i = 0; i < 24; i++) {
    const cand = `${y}${String(m).padStart(2, "0")}${dd}`
    if (cand <= to && (from === null || cand > from)) return cand
    if (cand <= (from ?? "")) break
    m -= 1
    if (m === 0) { y -= 1; m = 12 }
  }
  return null
}

/** 직전 스냅샷 이후 ~ 이번 스냅샷까지의 상태를 읽는다 */
async function readPrev(db: Pool, account_no: string, stock_code: string, snap_date: string) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(qty), 0)::float8        AS qty,
            COALESCE(SUM(qty * s_amt), 0)::float8 AS cost,
            MAX(s_date)                           AS last_date
     FROM my_stock
     WHERE account_no = $1 AND stock_code = $2 AND s_date <= $3`,
    [account_no, stock_code, ymd(snap_date)]
  )
  return {
    qty:  Number(rows[0].qty),
    cost: Number(rows[0].cost),
    last_date: rows[0].last_date as string | null,
  }
}

/**
 * 구간 입금 구성 — 자금 구분 안분의 근거.
 *
 * 연금저축은 분배금과 자동이체(현금)가 섞여 들어온다. 계좌 내역에 이미
 * 구분돼 있으므로 그 비율로 매입을 나눈다. 구간에 입금이 없으면 분배금으로 본다
 * (적립 재원이 분배금 재투자라는 전제).
 */
async function readInflow(db: Pool, account_no: string, from: string | null, to: string) {
  // '잔액 조정' 은 실제 입금이 아니라 차이를 메운 보정이다. 자금 출처로 세면 안 된다
  const { rows } = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN memo LIKE '분배금:%' THEN amt ELSE 0 END), 0)::float8 AS div_in,
       COALESCE(SUM(CASE WHEN memo NOT LIKE '분배금:%' THEN amt ELSE 0 END), 0)::float8 AS cash_in
     FROM my_account_info
     WHERE account_no = $1 AND in_out = 'I'
       AND memo NOT LIKE '잔액 조정%'
       AND ($2::varchar IS NULL OR trade_date > $2)
       AND trade_date <= $3`,
    [account_no, from, to]
  )
  return { div: Number(rows[0].div_in), cash: Number(rows[0].cash_in) }
}

/**
 * 스냅샷을 계획으로 바꾼다. DB 를 바꾸지 않는다 — 미리보기와 저장이 같은 계산을 쓴다.
 *
 * **기산일 처리** — 구간이 분배금 기산일(매월 `baseDay`)을 가로지르면
 * 매입을 두 행으로 쪼갠다. 기산일까지의 몫은 **기산일 날짜로**, 나머지는 **입력일 날짜로** 넣는다.
 * 분배금 대상 수량은 기산일 하루만 보기 때문에, 그 경계만 맞추면 분배금 계산이 어긋나지 않는다.
 * 수량은 구간 내 실제 거래일 수에 비례해 나눈다 (`t_stock_amt` 의 거래일을 쓴다 — 휴일표 불필요).
 */
export async function planSnapshot(
  db: Pool,
  input: SnapshotInput,
  baseDay: number,
): Promise<SnapshotPlan> {
  const errors: string[] = []
  const prev = await readPrev(db, input.account_no, input.stock_code, input.snap_date)

  const add_qty  = input.qty - prev.qty
  const add_cost = Math.round(input.qty * input.avg_price - prev.cost)

  if (add_qty < 0) {
    errors.push(
      `보유 수량이 줄었습니다 (${prev.qty} → ${input.qty}주). ` +
      `평균 매입가는 매도해도 바뀌지 않아 스냅샷으로는 매도를 역산할 수 없습니다. ` +
      `매도는 매입/매도 모달에서 따로 입력하세요.`
    )
  }
  if (add_qty > 0 && add_cost <= 0) {
    errors.push(`수량은 늘었는데 매입금액이 0 이하입니다 (${add_cost}원). 평균 매입가를 확인하세요.`)
  }

  const unit_price = add_qty > 0 ? add_cost / add_qty : 0

  // 구간 거래일 — 실제 거래가 있었던 날만 센다
  const from = prev.last_date
  const { rows: tdRows } = await db.query(
    `SELECT TO_CHAR(e_date, 'YYYYMMDD') AS d
     FROM t_stock_amt
     WHERE stock_code = $1
       AND ($2::varchar IS NULL OR TO_CHAR(e_date,'YYYYMMDD') > $2)
       AND TO_CHAR(e_date,'YYYYMMDD') <= $3
     ORDER BY e_date`,
    [input.stock_code, from, ymd(input.snap_date)]
  )
  const tradeDays: string[] = tdRows.map(r => r.d)

  // 구간이 기산일을 가로지르는가 — **달력 기준**으로 본다.
  // 거래일 목록에서 찾으면 기산일이 휴장일이거나 아직 주가가 안 들어온 미래 구간일 때 놓친다.
  const baseYmd = lastBaseDayIn(from, ymd(input.snap_date), baseDay)
  const base_date = baseYmd ? `${baseYmd.slice(0,4)}-${baseYmd.slice(4,6)}-${baseYmd.slice(6,8)}` : null

  // 자금 구분 — 구간 입금 비율로 안분
  const inflow = await readInflow(db, input.account_no, from, ymd(input.snap_date))
  const inflowTotal = inflow.div + inflow.cash

  const buys: PlannedBuy[] = []
  let split_basis: "trading" | "weekday" | null = null
  if (add_qty > 0 && errors.length === 0) {
    // 기산일 기준으로 수량을 거래일 수에 비례 배분
    let headQty = add_qty
    let tailQty = 0
    if (baseYmd && baseYmd !== ymd(input.snap_date)) {
      // 매수는 거래일에만 일어나므로 **거래일 수**로 나눈다.
      // 주가가 아직 안 들어온 구간은 평일 수로 대신한다 — 달력일로 세면 주말·공휴일을
      // 거래일과 똑같이 세어 휴일이 몰린 구간이 과대평가된다.
      let headDays: number, allDays: number
      if (tradeDays.length > 0) {
        split_basis = "trading"
        headDays = tradeDays.filter(d => d <= baseYmd).length
        allDays  = tradeDays.length
      } else {
        split_basis = "weekday"
        headDays = countWeekdays(from, baseYmd)
        allDays  = countWeekdays(from, ymd(input.snap_date))
      }
      headDays = Math.max(1, headDays)
      allDays  = Math.max(headDays, allDays)
      headQty = Math.round(add_qty * headDays / allDays)
      tailQty = add_qty - headQty
    }

    const push = (s_date: string, qty: number, is_base_day: boolean) => {
      if (qty <= 0) return
      const cost = Math.round(add_cost * qty / add_qty)
      // 자금 구분 안분 — 분배금 비중만큼 분배금 행으로, 나머지는 현금 행으로
      const divRatio = inflowTotal > 0 ? inflow.div / inflowTotal : 1
      const divQty   = Math.round(qty * divRatio)
      const cashQty  = qty - divQty
      if (divQty > 0)  buys.push({ s_date, qty: divQty,  s_amt: cost / qty, fund_type: 2, is_base_day })
      if (cashQty > 0) buys.push({ s_date, qty: cashQty, s_amt: cost / qty, fund_type: 1, is_base_day })
    }

    if (tailQty > 0) {
      push(baseYmd!, headQty, true)
      push(ymd(input.snap_date), tailQty, false)
    } else {
      push(ymd(input.snap_date), add_qty, baseYmd === ymd(input.snap_date))
    }
  }

  // 잔액 검증 — 직전 잔액에서 구간 입금을 더하고 매입을 뺀 값이 실제와 맞는가
  let expected_balance: number | null = null
  let balance_gap: number | null = null
  if (input.balance != null) {
    const { rows: balRows } = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN in_out='I' THEN amt ELSE -amt END), 0)::float8 AS bal
       FROM my_account_info WHERE account_no = $1 AND ($2::varchar IS NULL OR trade_date <= $2)`,
      [input.account_no, ymd(input.snap_date)]
    )
    expected_balance = Math.round(Number(balRows[0].bal) - add_cost)
    balance_gap = input.balance - expected_balance
  }

  return {
    account_no: input.account_no,
    stock_code: input.stock_code,
    prev_qty: prev.qty,
    prev_cost: Math.round(prev.cost),
    add_qty,
    add_cost,
    unit_price,
    base_date,
    split_basis,
    buys,
    inflow_cash: Math.round(inflow.cash),
    inflow_div:  Math.round(inflow.div),
    expected_balance,
    actual_balance: input.balance,
    balance_gap,
    errors,
  }
}

/** 계획을 DB 에 반영한다. 매입 행 + 대응 출금 행 + 잔액 조정 행. */
export async function applySnapshot(db: Pool, plan: SnapshotPlan, snap_date: string): Promise<void> {
  if (plan.errors.length) throw new Error(plan.errors[0])

  for (const b of plan.buys) {
    await db.query(
      `INSERT INTO my_stock (account_no, stock_code, s_date, cnt, stock_type, fund_type, qty, s_amt)
       VALUES ($1, $2, $3, 1, 2, $4, $5, $6)`,
      [plan.account_no, plan.stock_code, b.s_date, b.fund_type, b.qty, b.s_amt]
    )
    await db.query(
      `INSERT INTO my_account_info (account_no, trade_date, in_out, amt, memo)
       VALUES ($1, $2, 'O', $3, $4)`,
      [plan.account_no, b.s_date, Math.round(b.qty * b.s_amt),
       `매입${b.fund_type === 2 ? "(분배금)" : "(현금)"}: ${plan.stock_code} — 적립 스냅샷`]
    )
  }

  // 모르는 입출금을 한 줄로 흡수한다. 이게 있어서 매일 입력하지 않아도 예수금이 맞는다
  if (plan.balance_gap != null && plan.balance_gap !== 0) {
    await db.query(
      `INSERT INTO my_account_info (account_no, trade_date, in_out, amt, memo)
       VALUES ($1, $2, $3, $4, $5)`,
      [plan.account_no, ymd(snap_date), plan.balance_gap > 0 ? "I" : "O",
       Math.abs(plan.balance_gap), `잔액 조정 (적립 스냅샷 ${snap_date})`]
    )
  }
}
