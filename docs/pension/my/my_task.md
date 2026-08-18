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
| 퇴직연금 | `lib/pension-ret-calc.ts` |
| 개인연금 | `lib/pension-per-calc.ts` `simulatePer()` |
| 프로필 | `lib/profile.ts` `ageOn` / `ymAtAge` / `retireEndYm` |
| 적립 계획 | `lib/settings.ts` `perSettingsFromEnv()` |

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

## 화면 (`page.tsx`)

### 색상

연금별로 고정한다. 스택 바·카드·범례가 같은 색을 쓴다.

| 연금 | 색 |
|------|-----|
| 개인연금 | purple |
| 퇴직연금 | emerald |
| 국민연금 | blue |

### 스택 바 (`StageBar`)

- 막대 전체 폭 = `stage.total / maxTotal` — 국민연금이 더해지면 막대가 길어진다
- 내부 분할 = 연금별 비중. 비중 15% 미만이면 라벨을 숨긴다
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
