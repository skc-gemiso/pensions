/**
 * `my_shopping` 의 `item_type = 'ref'` 행을 어느 메뉴 것인지 가르는 구분값.
 *
 * 화면에서 고르는 값이 아니라 **호출하는 메뉴가 정한다**. 다른 메뉴가 붙으면 여기에 한 줄 더한다.
 *
 * 2026-10: 주식 투자 「투자 이력」이 전용 테이블 `my_history` 로 분리되면서
 * `stock` 구분이 빠졌다. 지금은 쇼핑만 쓴다.
 *
 * `actions.ts` 는 `"use server"` 라 async 함수만 export 할 수 있어 상수를 여기 둔다.
 */
export const REF_GROUPS = {
  ref: "참고 자료",
} as const

export type RefGroup = keyof typeof REF_GROUPS
