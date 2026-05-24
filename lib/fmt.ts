/**
 * 숫자를 한국어 로케일 형식(천단위 구분자)으로 변환합니다.
 * main_design.md 숫자 표시 형식 기준 적용.
 *
 * 사용 예시:
 *   fmt(75200, 0)   → "75,200"
 *   fmt(1.234, 1)   → "1.2"
 *   fmt(null)       → "-"
 *
 * @param n   변환할 숫자. null / undefined 이면 "-" 반환.
 * @param dec 소수점 자리수 (기본값 0)
 */
export function fmt(n: number | null | undefined, dec = 0): string {
  if (n == null) return "-"
  return Number(n).toLocaleString("ko-KR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

/**
 * 숫자의 부호에 따라 Tailwind 텍스트 색상 클래스를 반환합니다.
 * main_design.md 색상 코딩 기준 적용.
 *
 *   양수(+) → "text-red-600"
 *   음수(-) → "text-blue-600"
 *   0 / null → "text-gray-400"
 */
export function cc(v: number | null | undefined): string {
  if (v == null || v === 0) return "text-gray-400"
  return v > 0 ? "text-red-600" : "text-blue-600"
}

/**
 * 원화 금액을 만원/억원/조원 단위로 자동 변환합니다.
 * main_design.md 금액 표시 기준 적용.
 *
 *   < 1만                  → "1,234원"       (0자리)
 *   1만 ~ 9999만           → "1,234만원"     (0자리)
 *   1억 ~ 9.9억            → "1.2억원"       (1자리)
 *   10억 ~ 9999억          → "1,234억원"     (0자리)
 *   1조 ~ 9.9조            → "1.2조원"       (1자리)
 *   10조 이상              → "1,234조원"     (0자리)
 *
 *   음수는 부호를 보존합니다 (예: "-5.3억원").
 *   raw KRW 값(원 단위)을 그대로 넘긴다.
 */
export function fmtKRW(n: number | null | undefined): string {
  if (n == null) return "-"
  const sign = n < 0 ? "-" : ""
  const abs = Math.abs(n)
  if (abs >= 1e13) return sign + fmt(abs / 1e12, 0) + "조원"
  if (abs >= 1e12) return sign + fmt(abs / 1e12, 1) + "조원"
  if (abs >= 1e9)  return sign + fmt(abs / 1e8,  0) + "억원"
  if (abs >= 1e8)  return sign + fmt(abs / 1e8,  1) + "억원"
  if (abs >= 1e4)  return sign + fmt(abs / 1e4,  0) + "만원"
  return sign + fmt(abs, 0) + "원"
}

/**
 * 주식 수량(주)을 만주/억주 단위로 변환합니다.
 * main_design.md 수량 표시 기준 적용.
 *
 *   < 10,000          → "1,234주"
 *   10,000 ~ 99,999,999 → "1,234만주"
 *   ≥ 100,000,000     → "1,234억주"
 *
 *   음수는 부호를 보존합니다 (예: "-50만주").
 */
export function fmtShares(n: number | null | undefined): string {
  if (n == null) return "-"
  const sign = n < 0 ? "-" : ""
  const abs = Math.abs(n)
  if (abs >= 1e8) return sign + fmt(abs / 1e8, 0) + "억주"
  if (abs >= 1e4) return sign + fmt(abs / 1e4, 0) + "만주"
  return sign + fmt(abs, 0) + "주"
}
