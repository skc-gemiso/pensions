import type { Pool } from "pg"

/**
 * 분배금 → 계좌 입금 행 생성 규칙.
 *
 * 화면(서버 액션, admin 인증)과 Cron(인증 없이 서버 내부 호출) 두 곳이 쓴다.
 * `"use server"` 파일에 두면 가드 없는 함수가 클라이언트에서 호출 가능한 서버 액션이
 * 되어버리므로 일반 모듈로 분리했다. **클라이언트 컴포넌트에서 import 금지.**
 */

// my_account_info 에는 분배금과 이어줄 컬럼이 없어 비고 문자열을 키로 쓴다.
// 이 형식으로 만든 행은 이 코드가 관리하는 행이라는 뜻이다 — 화면에서 비고를 고치면 연결이 끊긴다.
export const divMemo = (stockCode: string, refDate: string) => `분배금: ${stockCode} (${refDate})`

/**
 * 분배금 1건의 계좌 입금 내역을 지금 상태에 맞춘다.
 *
 * 비고 키로 기존 행을 **모두 지우고 다시 넣는다** — 몇 번을 돌려도 결과가 같고
 * 계좌가 늘거나 수량이 바뀌어도 알아서 맞는다.
 *
 * - 입금일자는 **실지급일**(`pay_date`). 실지급일이 없으면 넣을 날짜가 없어 행을 지우기만 한다
 * - 금액은 지급 이력 테이블과 같은 **13일 기산 수량 × 주당 분배금** (세전)
 * - 계좌별로 한 행씩, 그날 수량이 있는 계좌만
 */
export async function syncDividendDeposits(
  db: Pool,
  stockCode: string,
  refDate: string,
): Promise<number> {
  const memo = divMemo(stockCode, refDate)
  await db.query(`DELETE FROM my_account_info WHERE memo = $1`, [memo])

  const { rows: divRows } = await db.query(
    `SELECT TO_CHAR(pay_date, 'YYYYMMDD') AS pay_date, dist_amt
     FROM t_etf_dividend WHERE stock_code = $1 AND ref_date = $2::date`,
    [stockCode, refDate]
  )
  const div = divRows[0]
  if (!div?.pay_date || !Number(div.dist_amt)) return 0

  // 지급기준일이 속한 달 13일까지 누적된 계좌별 순수량 (getMonthlyDividendByAccount 와 같은 기준)
  const { rows: acctRows } = await db.query(
    `SELECT ms.account_no, SUM(ms.qty)::int AS qty_13th
     FROM my_stock ms
     WHERE ms.stock_code = $1
       AND ms.s_date <= TO_CHAR($2::date, 'YYYYMM') || '13'
     GROUP BY ms.account_no
     HAVING SUM(ms.qty) > 0`,
    [stockCode, refDate]
  )

  let saved = 0
  for (const a of acctRows) {
    const amt = Math.round(Number(a.qty_13th) * Number(div.dist_amt))
    if (amt <= 0) continue
    await db.query(
      `INSERT INTO my_account_info (account_no, trade_date, in_out, amt, memo)
       VALUES ($1, $2, 'I', $3, $4)`,
      [a.account_no, div.pay_date, amt, memo]
    )
    saved++
  }
  return saved
}

/**
 * 한 종목의 등록된 분배금 전체에 대해 입금 행을 다시 만든다.
 *
 * 지우고 다시 넣는 방식이라 여러 번 돌려도 중복되지 않는다.
 * 다만 이 연동 이전에 **손으로 넣은 분배금 입금 행은 비고가 달라 남는다** — 그건 직접 지워야 한다.
 */
export async function syncAllDividendDeposits(
  db: Pool,
  stockCode: string,
): Promise<{ dividends: number; deposits: number }> {
  const { rows } = await db.query(
    `SELECT TO_CHAR(ref_date, 'YYYY-MM-DD') AS ref_date
     FROM t_etf_dividend WHERE stock_code = $1 ORDER BY ref_date`,
    [stockCode]
  )
  let deposits = 0
  for (const r of rows) deposits += await syncDividendDeposits(db, stockCode, r.ref_date)
  return { dividends: rows.length, deposits }
}
