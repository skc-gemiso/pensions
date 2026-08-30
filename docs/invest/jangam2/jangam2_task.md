# 장암2구역 투자 현황 — 상세 스펙

## 데이터 파일 `data/jangam2.md`

git 에 커밋한다 (`config/.env` 와 달리 gitignore 대상이 아니다 — Vercel 배포본에 파일이 있어야 한다).

### 섹션 규칙

| 섹션 (`## …`) | 형식 | 파싱 결과 |
|---------------|------|-----------|
| `일반 현황` | `- 키: 값` 목록 | `{ key, value }[]` |
| `추진 경과` | 표 `일자 \| 내용 \| 비고` | `{ date, title, note }[]` — 일자 desc 정렬. `비고` 는 비워도 되고 컬럼이 없어도 된다 |
| `조합원 제공품` | `- 값` 목록 | `string[]` |
| `특화 품목` (구 `아파트 특화`) | `- 값` 목록 | `string[]` |
| `종전자산 평가` | 표 `일자 \| 평가금액 \| 비례율 \| 권리가액` | `{ date, eval_amt, ratio, right_amt }[]` — 일자 desc |
| `조합원 분양 예정가` | 표 `일자 \| 23평 \| 26평 \| 35평 \| 39평 \| 43평` | `{ date, by_size }[]` — 일자 desc |
| `주식 계좌` | `- 계좌번호: …` / `- 계좌명: …` | `{ account_no, account_nm }` |
| `기타 준비 자금` | 표 `항목 \| 금액 \| 비고` | `others: { item, amt, note }[]` — 필요 자금에서 **뺀다** |
| `이자 비용` | 표 `항목 \| 23평 \| … \| 43평 \| 비고` | `interests: { item, by_size, note }[]` — **평형별로** 필요 자금에 **더한다** |

### 작성 규칙

- **종전자산 평가 · 조합원 분양 예정가는 일자별로 행을 계속 추가**한다. 화면은 이력 전체를 보여주고,
  일자 내림차순 **첫 행(최신)** 을 추정 분담금·자금 준비 계산 기준으로 쓴다.
- 금액은 **원 단위 숫자**로 적는다. 콤마(`,`)·공백·`원` 은 파서가 제거한다. 단위(만원·억원) 표기 금지.
- 비례율은 `%` 값으로 적는다 (`102.66` = 102.66%).
- 분양 예정가 평형은 **23·26·35·39·43** 5개 고정. 값이 비면 빈 칸으로 두고, 화면은 `-` 로 표시하며
  해당 평형은 자금 계산에서 제외한다.
- 권리가액은 MD 에 적은 값을 그대로 쓴다 (검산: `평가금액 × 비례율/100` — 161,280,000 × 1.0266 = 165,570,048).
- 표 구분선(`| --- | --- |`)은 있어도 없어도 된다 (파서가 건너뛴다).
- 섹션이 없거나 비어 있어도 에러 없이 빈 배열이 되고, 화면은 "기록된 자료가 없습니다" 를 표시한다.

## 파서 `lib/jangam2.ts` (서버 전용)

외부 의존성 없음. 클라이언트 컴포넌트에서 import 금지 (`fs` 사용).

```ts
export type Jangam2Data = {
  general:  { key: string; value: string }[]
  progress: { date: string; title: string; note: string }[]
  gifts:    string[]
  features: string[]
  assets:   { date: string; eval_amt: number; ratio: number; right_amt: number }[]
  prices:   { date: string; by_size: Record<string, number | null> }[]
  account:   { account_no: string; account_nm: string } | null
  others:    { item: string; amt: number; note: string }[]   // 차감 (평형 무관)
  interests: InterestRow[]                                   // 가산 (평형별)
}

export type InterestRow = {
  item:    string
  by_size: Record<string, number | null>
  note:    string
}

export const UNIT_SIZES = ["23평", "26평", "35평", "39평", "43평"] as const
export function readJangam2Data(): Jangam2Data
```

내부 헬퍼

| 함수 | 역할 |
|------|------|
| `splitSections(md)` | `## ` 기준 분할 → `Map<제목, 본문줄[]>` |
| `parseKeyValues(lines)` | `- 키: 값` → `{ key, value }[]` |
| `parseBullets(lines)` | `- 값` → `string[]` |
| `parseTable(lines)` | `\|` 로 시작하는 줄만, 헤더 1행 + 구분선 스킵 → `{ headers, rows }` |
| `num(s)` | 콤마·공백·`원` 제거 후 `Number`. 빈 값·NaN 이면 `null` |

`lines(...names)` 는 **섹션 제목 별칭**을 받는다 — 먼저 찾히는 것을 쓴다.
제목을 바꿔도 예전 이름의 MD 가 계속 동작한다 (예: `lines("특화 품목", "아파트 특화")`).

- 파일 경로: `path.join(process.cwd(), "data", "jangam2.md")`
- 파일이 없으면 빈 데이터를 돌려준다 (throw 하지 않는다).
- **캐시하지 않는다** — 호출마다 읽어야 MD 수정이 새로고침만으로 반영된다. 파일은 수 KB 라 비용이 없다.

## Server Action `app/invest/jangam2/actions.ts`

```ts
export type Jangam2Page = Jangam2Data & {
  stock_eval_amt:   number         // 대상 계좌 보유 종목 평가액 합계
  stock_price_date: string | null  // t_stock_amt 최신 기준일
  stock_found:      boolean        // 계좌에 보유 종목이 있었는지
}

export async function getJangam2(): Promise<Jangam2Page>
```

- 첫 줄에서 `await requireAdmin()` ([lib/guard.ts](../../../lib/guard.ts)).
- 주식 계좌 평가액은 기존 액션 **재사용**: `getHoldings(accountNo)` ([app/assets/stock/actions.ts](../../../app/assets/stock/actions.ts))
  → `Σ (net_qty × latest_price)`. 계좌번호는 MD `## 주식 계좌` 값이며 하드코딩하지 않는다.
- 계좌 섹션이 없거나 보유 종목이 없으면 `stock_eval_amt = 0`, `stock_found = false`.
  DB 조회가 실패해도 화면 전체가 죽지 않게 `0` 으로 떨어뜨린다.

## 자금 준비 현황 산식

```
latestAsset = assets[0]            // 일자 desc 첫 행
latestPrice = prices[0]
otherSum = Σ others[].amt          // 준비된 재원 → 차감 (평형 무관)

평형별:
  분양예정가 = latestPrice.by_size[평형]        // null 이면 행 전체 "-"
  권리가액   = latestAsset.right_amt
  추정분담금 = 분양예정가 − 권리가액
  이자       = Σ interests[].by_size[평형]      // 해당 평형 열의 합계
  필요자금   = 추정분담금 + 이자 − stock_eval_amt − otherSum
```

`이자 비용` 은 중도금 이자처럼 분양가에 비례하므로 **평형마다 다른 값**을 갖는다.
빈 칸은 0 으로 합산한다.

- `필요자금 > 0` → 부족, `text-red-600`
- `필요자금 <= 0` → 충족, `text-blue-600` (금액은 `충족 (N 여유)` 로 표시)
- 색상은 `cc(필요자금)` 으로 얻는다 — `cc` 는 양수를 빨강, 음수를 파랑으로 칠하므로 부호를 그대로 넘기면 된다.

## Vercel 배포 — file tracing

`data/*.md` 는 `app/` 밖이라 Next.js 파일 트레이싱이 자동으로 잡지 못한다.
[next.config.ts](../../../next.config.ts) 에 라우트별 include 를 명시한다.

```ts
outputFileTracingIncludes: {
  "/invest/jangam2": ["./data/**/*.md"],
}
```

빠뜨리면 로컬에선 정상이고 **배포본에서만** `ENOENT` 로 빈 화면이 된다.
(문서: `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`)

## 메뉴 마이그레이션

`v031_add_jangam2_menu` ([lib/auth-db.ts](../../../lib/auth-db.ts))

```sql
INSERT INTO app_menus (id, label, href, parent_id, sort_order)
VALUES ('jangam2', '장암2구역 투자 현황', '/invest/jangam2', 'invest', 40);
INSERT INTO app_role_menus (role, menu_id) VALUES ('admin', 'jangam2');
```

마이그레이션은 **로그인 시점**에 실행된다 (`auth.ts` 의 `authorize` / `signIn` 콜백).
메뉴가 안 보이면 한 번 로그아웃 후 재로그인한다.

`middleware.ts` 는 수정하지 않는다 — `NORMAL_ALLOWED = ["/sim", "/magic"]` 이라
새 경로는 자동으로 admin 전용이 된다.

## 화면 `app/invest/jangam2/page.tsx`

- `"use client"` + `AppLayout` + `useEffect` → `getJangam2()` (저장소 표준 패턴)
- 숫자 포맷은 [lib/fmt.ts](../../../lib/fmt.ts) 의 `fmt` / `fmtKRW` / `cc` 만 사용 (로컬 fmt 정의 금지)
- 카드 `bg-white rounded-xl border border-gray-200`, 표 헤더 `bg-gray-50 border-b border-gray-200`,
  금액·비율 셀 `text-right tabular-nums` — `docs/main_design.md` 기준
- 로딩 중 `불러오는 중…`, 데이터 없음 `기록된 자료가 없습니다`
