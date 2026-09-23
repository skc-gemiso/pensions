/**
 * `my_shopping` 의 `item_type = 'ref'` 행을 어느 메뉴 것인지 가르는 구분값.
 *
 * 구 참고 자료 행은 `category` 가 전부 `'ref'` 로 고정돼 있어 그대로 구분값이 됐다.
 * 화면에서 고르는 값이 아니라 **호출하는 메뉴가 정한다** — 쇼핑은 `ref`, 주식 투자는 `stock`.
 * 다른 메뉴가 붙으면 여기에 한 줄 더한다.
 *
 * `actions.ts` 는 `"use server"` 라 async 함수만 export 할 수 있어 상수를 여기 둔다.
 */
export const REF_GROUPS = {
  ref:   "참고 자료",
  stock: "주식 투자",
} as const

export type RefGroup = keyof typeof REF_GROUPS
