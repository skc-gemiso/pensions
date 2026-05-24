# 퇴직연금 — 기술 사양

`app/pension/ret/` 에 있는 퇴직연금 페이지 전체 사양서.

---

## 파일 구조

```
app/pension/ret/
└── page.tsx      클라이언트 컴포넌트 (계산 로직 + UI 전체)
```

---

## 근속 진행 현황

### 날짜 계산

```typescript
const START_DATE = new Date("2015-02-23")   // 입사일 (하드코딩)
const RETIRE_YEAR = 2034                     // 정년 (하드코딩)

const totalMonths = monthDiff(START_DATE, new Date(RETIRE_YEAR, 1, 23))
const elapsedMonths = monthDiff(START_DATE, today)
const progress = (elapsedMonths / totalMonths) * 100
```

---

## 퇴직소득세 계산 (2023년 개정)

### 계산 흐름

```
1. 퇴직급여 = 평균임금 × 30일 × 근속연수
2. 근속연수 공제액 계산
   - 5년 이하: 100만원 × 근속연수
   - 5~10년: 500만원 + 200만원 × (근속연수 - 5)
   - 10~20년: 1500만원 + 250만원 × (근속연수 - 10)
   - 20년 초과: 4000만원 + 300만원 × (근속연수 - 20)
3. 환산급여 = (퇴직급여 - 근속연수공제) ÷ 근속연수 × 12
4. 환산급여 공제
   - 800만원 이하: 전액
   - 800~7000만원: 800만원 + 초과분 × 60%
   - 7000만원 초과: 4520만원 + 초과분 × 55%
5. 과세표준 = 환산급여 - 환산급여공제
6. 산출세액 = 과세표준 × 누진세율
7. 퇴직소득세 = 산출세액 ÷ 12 × 근속연수
```

### 누진세율 구간

| 과세표준 | 세율 | 누진공제 |
|----------|------|----------|
| 1,400만원 이하 | 6% | 0 |
| ~5,000만원 | 15% | 126만원 |
| ~8,800만원 | 24% | 576만원 |
| ~1억 5천만원 | 35% | 1,544만원 |
| ~3억원 | 38% | 1,994만원 |
| ~5억원 | 40% | 2,594만원 |
| 5억원 초과 | 42% | 3,594만원 |

---

## IRP 운용 시뮬레이션

### 포트폴리오

```typescript
const PORTFOLIO = {
  coveredCall: { ratio: 0.7, annualDividend: 0.12 },  // KODEX 커버드콜 70%
  tdf: { ratio: 0.3, annualReturn: 0.05 }              // TDF 30%
}
```

### 배당 계산

```typescript
// 커버드콜 ETF 부분 연간 배당
const coveredCallAmount = retirementFund * PORTFOLIO.coveredCall.ratio
const annualDividend = coveredCallAmount * PORTFOLIO.coveredCall.annualDividend
const monthlyDividend = annualDividend / 12
```

---

## 데이터 구조

### `USER_PROJECTIONS` (하드코딩)

```typescript
const USER_PROJECTIONS: YearlyProjection[] = [
  { year: 2026, avgSalary: number, severanceFund: number },
  // ... 2034까지
]
```

각 연도별 예상 평균임금과 퇴직금을 수동 관리.

### `ComputedRetirement`

```typescript
interface ComputedRetirement {
  year: number
  grossSeverance: number    // 세전 퇴직금
  retirementTax: number     // 퇴직소득세
  netSeverance: number      // 세후 퇴직금
  irpAnnualDiv: number      // IRP 연 배당
  irpMonthlyDiv: number     // IRP 월 배당
}
```

---

## 주요 컴포넌트

### 근속 진행 바

- `START_DATE` ~ 정년 기준 진행률 시각화
- Tailwind `w-[{n}%]` 동적 스타일

### 퇴직금 요약 카드

- 현재 시점 기준 세전/세후/세액 3개 수치

### 연도별 퇴직금 테이블

- 2026~2034 행별: 연도 / 근속연수 / 세전 / 퇴직소득세 / 세후

### IRP 배당 시뮬 테이블

- 연도별: 퇴직금 → 커버드콜 70% 배당 / TDF 30% 배당 / 합계

---

## 알려진 제약 사항

- 입사일·정년·평균임금이 코드에 하드코딩됨
- `USER_PROJECTIONS` 수동 관리 필요 (DB 연동 미구현)
- 퇴직금 기준이 되는 평균임금은 추정값 사용
- IRP 의무 비율(안전자산 30%)을 무시한 자유 운용 가정
- 세율 개정 시 코드 직접 수정 필요
