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

입사일·정년은 **공통 프로필 환경 변수**(`PROFILE_*`, `config/.env`)에서 읽는다 (개인연금 화면과 공유).
`getProfile()` 이 실패했을 때만 `FALLBACK_JOIN` / `FALLBACK_RETIRE` 상수를 쓴다.

```typescript
const profile = await getProfile()          // app/actions/profile.ts
const JOIN_DATE   = toDate(profile.join_date)    // 2015-02-23
const retireDate  = toDate(profile.retire_date)  // retire_rule 로 계산된 정년일

const progress = monthDiff(JOIN_DATE, today) / monthDiff(JOIN_DATE, retireDate) * 100
```

`retire_date` 는 `lib/profile.ts` 의 `calcRetireDate()` 결과다.
현재 규정은 `month_end` — 만 60세 생일이 속한 달의 말일이므로 **2034-06-30**.
과거에는 입사 기념일(2034-02-23)로 잘못 잡혀 있었다.

정년 표기는 `retireDate` 의 연·월을 그대로 쓴다 (`2034년 06월`).

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

## 퇴직금 커버드콜 운용 시뮬레이션

**IRP·ISA 는 운용 계획이 없어 다루지 않는다.** 퇴직금을 일시금으로 받아
일반 계좌에서 KODEX 200 타겟위클리커버드콜 **100%** 로 운용하는 기준이다.

```typescript
const CC_STOCK_CODE = "498400"        // KODEX 200 타겟위클리커버드콜
const CC_FALLBACK_ANNUAL_RATE = 0.17  // 분배 이력을 못 읽었을 때만
const DIVIDEND_TAX = 0.154            // 배당소득세 14% + 지방소득세 1.4%
const FIN_INCOME_LIMIT_MAN = 2_000    // 금융소득종합과세 기준 (연 2,000만원)
```

### 분배율

하드코딩하지 않고 **실제 지급 이력**에서 구한다 — 개인연금 화면과 같은 기준이다.

```typescript
getEtfDividendHistory(CC_STOCK_CODE)   // app/sim/actions.ts 재사용
  → 최근 12회 dist_rate 평균 ÷ 100 = 월 분배율
  → × 12 = 연 분배율
```

조회에 실패하거나 이력이 없으면 `CC_FALLBACK_ANNUAL_RATE` 를 쓰고,
화면의 분배율 배지에 `기본 추정치` 로 표시한다.

### 분배금 계산

```typescript
연 분배금(세전) = 실수령 퇴직금 × 연 분배율
월 분배금(세전) = 연 분배금 ÷ 12
연 분배금(세후) = 연 분배금(세전) × (1 − 0.154)
월 분배금(세후) = 연 분배금(세후) ÷ 12
```

- 원금(수량)을 헐지 않고 분배금만 받는 구조라 수령액이 유지된다
- 연 분배금(세전)이 2,000만원을 넘는 행에는 `종합과세` 배지를 붙인다 —
  금융소득종합과세 대상이라 실효세율이 15.4%보다 높아진다

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
  yearlyGross: number       // 연 분배금(세전)
  monthlyGross: number      // 월 분배금(세전)
  yearlyNet: number         // 연 분배금(세후)
  monthlyNet: number        // 월 분배금(세후)
  overFinLimit: boolean     // 금융소득종합과세 대상 여부
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

### 커버드콜 분배금 시뮬 테이블

- 상단: 운용 기준 카드 (커버드콜 100% · 연 분배율 + 산출 근거)
- 연도별: 퇴직 시점 / 투자 원금 / 월·연 분배금(세전) / 월·연 분배금(세후)
- 연 분배금(세전) 2,000만원 초과 행에 `종합과세` 배지

---

## 알려진 제약 사항

- 평균임금이 코드에 하드코딩됨 (입사일·정년은 `PROFILE_*` 환경 변수로 이전 완료)
- `USER_PROJECTIONS` 수동 관리 필요 (DB 연동 미구현)
- 퇴직금 기준이 되는 평균임금은 추정값 사용
- 주가 변동을 반영하지 않는다 — 분배율만 곱하므로 평가액 하락 시 분배금도 함께 준다
- 금융소득종합과세는 대상 여부만 표시하고 실효세율은 계산하지 않는다
- 세율 개정 시 코드 직접 수정 필요
