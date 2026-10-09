/**
 * `my_history.category` — 투자 이력의 구분.
 *
 * 쇼핑 참고 자료(`my_shopping`)에서 분리된 뒤 이 테이블이 투자 이력 전용이 됐다.
 * 메뉴를 가르는 값이 아니라 **글의 성격**을 가르는 값이라 화면에서 직접 고른다.
 *
 * 서버 액션 파일은 `"use server"` 라 async 함수만 export 할 수 있어 상수를 여기 둔다.
 */
export const HISTORY_CATEGORIES = {
  stock:   "주식",
  pension: "연금",
} as const

export type HistoryCategory = keyof typeof HISTORY_CATEGORIES

export const HISTORY_CATEGORY_KEYS = Object.keys(HISTORY_CATEGORIES) as HistoryCategory[]

export function isHistoryCategory(v: string): v is HistoryCategory {
  return v in HISTORY_CATEGORIES
}
