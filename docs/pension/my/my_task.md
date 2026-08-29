# 나의 연금 현황 — 기술 사양

`/pension/my` 통합 대시보드의 데이터 흐름과 계산 규칙.

---

## 파일 구조

```
app/pension/my/
├── page.tsx      클라이언트 컴포넌트 (UI + 도움말)
└── actions.ts    getPensionOverview() — 세 연금 합산
```

계산은 직접 하지 않고 **각 화면과 같은 모듈을 재사용**한다.
값이 화면마다 어긋나면 안 되기 때문이다.

| 대상 | 재사용 모듈 |
|------|-------------|
| 퇴직연금 | `lib/pension-ret-calc.ts` — 미래 예상은 `buildRetirementRows`·`grownValue`, 과거 추이는 `calcCurrentSeverance`·`calcTenure` |
| 개인연금 | `lib/pension-per-calc.ts` `simulatePer()` |
| 프로필 | `lib/profile.ts` `ageOn` / `ymAtAge` / `retireEndYm` |
| 적립 계획 | `lib/settings.ts` `perSettingsFromEnv()` |

액션은 두 개다.

| 액션 | 내용 |
|------|------|
| `getPensionOverview()` | 요약 + 수령 시점별 (미래) |
| `getPensionHistory()` | 월별 과거 실적 추이 |

---

## `getPensionOverview()` (`app/pension/my/actions.ts`)

`requireAdmin()` 으로 보호. 반환 타입:

```typescript
type PensionOverview = {
  today: string           // 'YYYY-MM'
  currentAge: number
  birthDate: string
  retireDate: string
  pensions: PensionSummary[]   // per / ret / nat 순
  stages: PayoutStage[]        // 수령 개시 시점별 합산
  peakMonthly: number          // 전부 받을 때의 월 합계
  ccAnnualRate: number         // 커버드콜 연 분배율 (공통 전제)
}
```

### 상수

```typescript
const NAT_PAYOUT_AGE   = 65        // 1969년 이후 출생자
const NAT_START_YM     = "2007-11" // 국민연금 가입 시작
const NAT_TOTAL_MONTHS = 319       // 총 납부 예정 개월
```

### 연금별 산출

| 연금 | 월 수령액 | 적립 현황 | 진행률 |
|------|-----------|-----------|--------|
| 국민연금 | `np_snapshots` 최신 `monthly_net` | 최신 `total_premium` | 납부 개월 / 319 |
| 퇴직연금 | 정년 행 `netMan` → `grownValue()` → × 연분배율 ÷ 12 | `calcCurrentSeverance()` 실수령 | 근속일수 / 입사~정년 |
| 개인연금 | `simulatePer().monthlyPayout` | 현재 보유수량 × 주가 | 현재 평가액 / 수령 시점 평가액 |

- 퇴직연금은 **만원 단위**로 계산되므로 마지막에 `× 10_000` 한다
- 개인연금 진행률은 개월이 아니라 **금액 기준**이다 (적립 시작 시점을 모르기 때문)
- 국민연금 스냅샷이 없으면 0원으로 표시된다 (에러를 내지 않는다)

### `stages` 생성

수령 개시 `startYm` 을 모아 중복 제거·정렬하고, 각 시점에서 **그때까지 시작된 연금을 합산**한다.

```typescript
const marks = [...new Set(pensions.map(p => p.startYm))].sort()
stages = marks.map(ym => {
  const active = pensions.filter(p => p.startYm <= ym)
  return { fromYm: ym, total: active.reduce(...), starting: /* 그 시점에 새로 시작 */ }
})
```

현재 데이터에서는 2단계가 나온다.

| 구간 | 나이 | 개인연금 | 퇴직연금 | 국민연금 | 합계 |
|------|------|----------|----------|----------|------|
| 2037.06~ | 63세 | 578만원 | 397만원 | — | **975만원** |
| 2039.06~ | 65세 | 578만원 | 397만원 | 131만원 | **1,106만원** |

---

## `getPensionHistory()` — 월별 과거 실적 추이

새 테이블을 만들지 않고 기존 데이터로 재구성한다.
`getPensionOverview()` 와 **분리된 액션**이다 — 화면 첫 페인트를 막지 않으려고 따로 부른다.

```typescript
type PensionHistory = {
  kind: PensionKind
  label: string              // '연금저축펀드 평가액' / '실수령 퇴직금' / '총 납부 보험료'
  points: { ym: string; value: number }[]
  changePct: number | null   // 첫 점 대비 마지막 점
  rangeLabel: string         // '2026.05 → 2026.08' / '최근 12개월' / '확인 3회 · …'
}
```

### 연금마다 촘촘함이 다르다 — 억지로 맞추지 않는다

| 연금 | 산출 | 범위 |
|------|------|------|
| 개인연금 | 월말 거래일의 누적 순수량 × 그날 종가 (SQL 1회) | 보유가 생긴 달부터 |
| 퇴직연금 | `calcCurrentSeverance()` 를 과거 월말로 재호출 — **DB 조회 없음** | 최근 `RET_HISTORY_MONTHS`(12)개월 |
| 국민연금 | `np_snapshots` 를 그대로 | 확인 시점 3건 |

```sql
-- 개인연금: 월별 마지막 거래일 기준
WITH months AS (
  SELECT TO_CHAR(e_date,'YYYY-MM') AS ym, MAX(e_date) AS eom
  FROM t_stock_amt WHERE stock_code = $2 GROUP BY 1
)
SELECT m.ym, ((SELECT COALESCE(SUM(s.qty),0) FROM my_stock s
               WHERE s.account_no=$1 AND s.stock_code=$2
                 AND TO_DATE(s.s_date,'YYYYMMDD') <= m.eom) * a.e_amt)::bigint AS value
FROM months m JOIN t_stock_amt a ON a.stock_code=$2 AND a.e_date=m.eom
ORDER BY m.ym
```

- 보유수량이 0인 달은 버린다 — 앞에 0원 구간이 길게 붙으면 추이가 안 보인다
- **국민연금은 월 단위가 아니다.** 스냅샷 사이를 보간하지 않는다 —
  없는 데이터를 지어내는 셈이기 때문이다. `확인 3회` 로 표기한다
- 퇴직연금 이번 달 점은 월말이 아니라 **오늘까지**의 근속으로 계산한다

실측(2026-08 기준):

| 연금 | 범위 | 변화 |
|------|------|------|
| 개인연금 | 2026.05 → 2026.08 | 4,635만 → 3,848만 **−17.0%** (2026-07 주가 하락) |
| 퇴직연금 | 최근 12개월 | 7,128만 → 7,748만 **+8.7%** |
| 국민연금 | 2023.05 → 2026.05 | 1.16억 → 1.44억 **+24.2%** |

---

## 화면 (`page.tsx`)

### 라이트 테마 유지

디자인 시안은 다크였으나 **레이아웃·구성만 가져오고 색은 라이트로 유지**한다
([main_design.md](../../main_design.md) 다크모드 미지원 규칙).

```
CARD = "bg-white border border-gray-200 rounded-2xl"
```

- 화면 하단 공백을 줄이려고 컨테이너에 `-mb-4 md:-mb-6` 를 걸어
  `AppLayout` 의 `main` 하단 패딩을 상쇄한다
- 구분선은 `border-gray-100`, 보조 면은 `bg-gray-50`
- **요약과 수령 시점별은 한 카드**다. 같은 이야기(합계 → 시점별 분해)라 나눌 이유가 없다.
  하단 구역만 `bg-gray-50/60` + `border-t` 로 구분하고, 스택 바 트랙은 `bg-gray-200/70` 을 쓴다

### 색상

연금별로 고정한다. 스택 바·카드·범례·아이콘이 같은 색을 쓴다.

| 연금 | 색 | 텍스트 | 카드 배경 |
|------|-----|--------|-----------|
| 개인연금 | purple | `text-purple-700` | `bg-purple-50` + `border-purple-200` |
| 퇴직연금 | emerald | `text-emerald-700` | `bg-emerald-50` + `border-emerald-200` |
| 국민연금 | blue | `text-blue-700` | `bg-blue-50` + `border-blue-200` |

아이콘은 `w-11~12` 원형에 `bg-gradient-to-br` + `ring-4 ring-{color}-100` 을 준다.
`PensionIcon` 이 연금별 SVG(사람 / 서류가방 / 은행)를 그린다.

### 숫자 표기

`splitKRW()` 로 숫자와 단위를 나눠 **단위만 작게** 쓴다 (`578` + `만원`).
합산 금액만 원 단위로 풀어 자릿수를 드러낸다 (`11,061,053원 / 월`).

### 같은 숫자를 두 번 쓰지 않는다

상단 카드에 연금별 **월 수령액**을 크게 쓰던 구역이 있었는데,
아래 스택 바(막대 안 금액)·연금별 카드(`5,779,923원`)와 **삼중 중복**이었다.
그 자리를 과거 추이로 바꿨다.

| 무엇 | 어디에서 |
|------|----------|
| 월 수령액 (금액) | 스택 바 + 연금별 카드 |
| 비중(%) | 스택 바 **범례** (`● 개인연금 52%`) |
| 적립 현황 (금액) | 연금별 카드 |
| 과거 추이 (변화율) | **상단 카드** |

상단 추이 구역에 **절대 금액을 쓰지 않는 것**이 요점이다.
쓰는 순간 연금별 카드의 `accumulated` 와 다시 중복된다 — 기간과 변화율만 둔다.

### 스파크라인 (`Sparkline`)

점이 3~12개뿐이라 recharts 를 쓰지 않고 SVG 로 직접 그린다.

- `viewBox="0 0 100 30"` + `preserveAspectRatio="none"`, 선은 `vectorEffect="non-scaling-stroke"`
  로 가로 늘림에도 굵기가 일정하다
- 색은 `stroke="currentColor"` 로 부모의 `TONE[kind].spark` 를 상속받는다
- **점이 4개 이하면 각 시점에 원을 찍는다** — 국민연금(3회)은 선만으론 안 읽힌다
- 값이 모두 같으면 가운데 점선, 점이 1개면 수평 점선

### 스택 바 (`StageBar`)

- 막대 전체 폭 = `stage.total / maxTotal` — 국민연금이 더해지면 막대가 길어진다
- 내부 분할 = 연금별 비중. 비중 12% 미만이면 라벨을 숨긴다
- 값이 0인 연금은 렌더링하지 않는다

### 도움말

공용 [components/HelpModal.tsx](../../../components/HelpModal.tsx), `variant="page"`.
탭은 `무엇을 모았나` / `공통 전제` / `⚠️ 한계` 3개.

- 연금별 성격 차이(실적 vs 예상)를 명확히 구분해 설명한다
- 커버드콜 비중을 계산해 보여준다 — 합계가 분배율 가정에 얼마나 기대는지
- 분배율·합계처럼 **조회 시점에 따라 달라지는 값은 본문에 그대로 넣는다**

---

## 알려진 제약 사항

- 국민연금 가입 시작·총 납부 개월이 상수다 (`NAT_START_YM`, `NAT_TOTAL_MONTHS`)
- 국민연금 개시 나이 65세도 상수다 — 조기·연기 수령 시나리오가 없다
- 정년~63세 공백 기간을 다루지 않는다
- 물가·건강보험료·세금 미반영
- 퇴직·개인연금이 같은 분배율 가정을 공유하므로, 분배율이 틀리면 **두 연금이 동시에** 틀린다
