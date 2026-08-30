"use server"

/**
 * 장암2구역 투자 현황 — 데이터 조회.
 *
 * 대부분의 값은 data/jangam2.md 에서 온다 (lib/jangam2.ts 파서).
 * 주식 계좌 평가액만 DB 실시간 조회이며, 주식 투자 화면의 getHoldings 를 재사용한다.
 * 산식은 docs/invest/jangam2/jangam2_task.md 참고.
 */

import { requireAdmin } from "@/lib/guard"
import { readJangam2Data, type Jangam2Data } from "@/lib/jangam2"
import { getHoldings } from "@/app/assets/stock/actions"

export type Jangam2Page = Jangam2Data & {
  stock_eval_amt:   number         // 대상 계좌 보유 종목 평가액 합계 (원)
  stock_price_date: string | null  // t_stock_amt 최신 기준일
  stock_found:      boolean        // 계좌에 보유 종목이 있었는지
}

export async function getJangam2(): Promise<Jangam2Page> {
  await requireAdmin()

  const data = readJangam2Data()

  let stock_eval_amt   = 0
  let stock_price_date: string | null = null
  let stock_found      = false

  if (data.account) {
    try {
      const holdings = await getHoldings(data.account.account_no)
      stock_found = holdings.length > 0
      for (const h of holdings) {
        if (h.latest_price == null) continue
        stock_eval_amt += h.net_qty * h.latest_price
        // 종목별 기준일이 다를 수 있어 가장 최근 날짜를 대표로 쓴다
        if (h.latest_date && (stock_price_date == null || h.latest_date > stock_price_date)) {
          stock_price_date = h.latest_date
        }
      }
      stock_eval_amt = Math.round(stock_eval_amt)
    } catch {
      // 계좌 조회 실패로 화면 전체가 죽지 않게 0 으로 둔다
      stock_eval_amt = 0
      stock_found    = false
    }
  }

  return { ...data, stock_eval_amt, stock_price_date, stock_found }
}
