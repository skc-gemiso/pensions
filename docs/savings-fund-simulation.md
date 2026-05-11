# 연금투자 시뮬레이션 — savings-fund

`app/personal-pension/savings-fund/` 에 있는 연금투자 시뮬레이션 페이지 전체 사양서.

---

## 파일 구조

```
app/personal-pension/savings-fund/
├── page.tsx      클라이언트 컴포넌트 (UI + 계산 로직 전체)
└── actions.ts    서버 액션 (DB CRUD)
```

---

## 탭 구성 및 접근 권한

| id | label | 접근 권한 | 특이사항 |
|---|---|---|---|
| `reference` | 수익율 확인 | 전체 | 일반 100% ETF 시뮬레이션 |
| `irp-reference` | IRP 수익율 확인 | 전체 | 안전자산 30% + ETF 70% (isIRP: true) |
| `dongmin` | 동민 | admin / khj | 개인 시뮬레이션 |
| `goeun` | 고은 | admin / khj | 개인 시뮬레이션 |
| `shine` | 샤인 | admin / khj | 개인 시뮬레이션 |

```typescript
// visibleTabs 결정 로직
const visibleTabs = (role === "admin" || role === "khj")
  ? TABS
  : TABS.filter((t) => t.id === "reference" || t.id === "irp-reference")
```

---

## 입력 파라미터 (`InputValues`)

| 필드 | 타입 | 설명 |
|---|---|---|
| `initDeposit` | number | 초기 입금액 (원) |
| `monthlyPmt` | number | 월 납입금 (원) |
| `accumMonths` | number | 적립 기간 (개월) |
| `holdMonths` | number | 보관 기간 (개월) — 생년월일 입력 시 자동 계산 |
| `ccAnnualRate` | number | 커버드콜 배당률 (연, 소수) — 기본 0.12 |
| `retirementAge` | number | 연금 수령 나이 (만 나이) — 기본 55 |
| `birthdate` | string | 생년월일 "YYYY-MM-DD" |
| `safeRate?` | number | IRP 전용: 안전자산 연수익률 (기본 0.05) |
| `taxFreeLimit?` | number | 예약 필드 (미사용) |

### holdMonths 자동 계산

```
holdMonths = max(0, retirementAge × 12 − currentAgeMonths − accumMonths)
```

생년월일이 입력되면 탭 변경·적립기간·수령나이 수정 시 자동 재계산.

---

## 핵심 계산 로직

### `fv(init, pmt, months, r)` — 미래가치 공식

표준 기말 연금(ordinary annuity) 복리 공식:

```
FV = init × (1+r)^n  +  pmt × [(1+r)^n − 1] / r
```

- `r ≈ 0` 예외 처리: `init + pmt × months` (선형)
- 단위: 만원 (1원 단위로 입력받아 `/10000` 변환 후 사용)

---

### 일반 탭 — `calculateRows(inp)`

100% ETF 투자 가정.

```
rEtf  = (1 + annualRate)^(1/12) − 1        // KODEX200 월수익률
rCc   = rEtf + ccAnnualRate / 12            // 커버드콜 = ETF + 고정 월 프리미엄

etf1  = fv(initW, pmtW, accumMonths, rEtf)  // 적립 완료 시점
etf2  = etf1 × (1+rEtf)^holdMonths         // 퇴직 시점

divAnnual  = cc2 × ccAnnualRate             // 퇴직 후 연 배당
divMonthly = divAnnual / 12
```

커버드콜 월수익률 모델: `rCc = rEtf + ccAnnualRate/12`
→ ETF 수익에 고정 월 프리미엄을 더하는 가산 모델 (소액 오차는 실용상 무시 가능)

---

### IRP 탭 — `calculateIRPRows(inp)`

납입액의 30% 안전자산(연복리) + 70% ETF(월복리) 의무 비율 적용.

```
rSafeM = (1 + safeRate)^(1/12) − 1         // 안전자산 월환산 수익률

// 안전자산 30% (두 ETF 컬럼 공통)
safe1  = fv(init×0.3, pmt×0.3, accumMonths, rSafeM)
safe2  = safe1 × (1+rSafeM)^holdMonths

// ETF 70%
etfRisky1 = fv(init×0.7, pmt×0.7, accumMonths, rEtfM)
etfRisky2 = etfRisky1 × (1+rEtfM)^holdMonths

// 합산
etf1 = etfRisky1 + safe1
etf2 = etfRisky2 + safe2

// 배당은 커버드콜 70% 부분에서만 산출 (안전자산은 배당 없음)
divAnnual = ccRisky2 × ccAnnualRate
```

안전자산 카드(UI)는 동일한 `fv` 공식으로 별도 계산하여 표시.

---

### 수익률 표시 공식

| 함수 | 공식 | 설명 |
|---|---|---|
| `retPct` | `(FV / invested − 1) × 100` | 총 납입 원금 대비 수익률 |
| `diffPct` | `(diff / invested) × 100` | 원금 대비 커버드콜 초과 수익 비율 |
| `invested` | `initDeposit + monthlyPmt × accumMonths` | 총 납입 원금 (단위: 만원) |

---

## DB 스키마 — `pension_sim_savings_fund`

```sql
CREATE TABLE pension_sim_savings_fund (
  id        SERIAL PRIMARY KEY,
  tab_id    VARCHAR(50)  NOT NULL,
  tab_label VARCHAR(50)  NOT NULL,
  title     VARCHAR(200),
  memo      TEXT,
  saved_by  VARCHAR(50),
  saved_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  inputs    JSONB        NOT NULL,
  results   JSONB        NOT NULL
);
```

- `ensureTable()` 로 런타임에 테이블/컬럼 자동 생성 (ALTER TABLE ADD COLUMN IF NOT EXISTS)
- `loadSimulations`: admin은 전체 조회, 일반 사용자는 `saved_by = userName` 필터
- `deleteSimulation`: ID 기준 삭제 (권한 체크 없음 — 신뢰된 내부 도구)

---

## 헬프 모달 (`PageHelpModal`) 탭 구성

| 탭 key | 라벨 | 주요 내용 |
|---|---|---|
| `guide` | 🚀 초보 가이드 | 5단계 실행 가이드, 핵심 숫자, 금지사항, 체크리스트 (기본 탭) |
| `accounts` | 계좌 유형 | 연금저축·IRP·ISA·퇴직연금(DB/DC) 상세 + 상황별 전략 |
| `criteria` | 투자 기준 | ETF 정보, 계좌별 배당세, 투자 조건 |
| `summary` | 화면 기능 요약 | 주요 기능 목록, 저장 흐름 |
| `detail` | 화면 상세 안내 | 시뮬레이션 테이블 컬럼별 설명 |

---

## 주요 컴포넌트

### `SimTable`

시뮬레이션 결과 테이블. 6개 연평균 수익률 행(-20% ~ +20%)에 대해
KODEX200 / 커버드콜 / 차액 / 퇴직 후 배당금을 표시.

```typescript
<SimTable
  rows={rows}
  accumMonths={curInput.accumMonths}
  holdMonths={curInput.holdMonths}
  muted?        // 저장 목록 조회 시 배경색 회색
/>
```

### `HelpPopover`

ETF 이름 옆 `?` 버튼. hover 시 오버레이로 ETF 구성·장단점 표시.

### `PageHelpModal`

헤더 우측 `ℹ` 버튼. Portal로 렌더링. 5개 탭 전환형 가이드.

---

## 상태 관리 핵심 패턴

### 탭 전환 시 HMR 상태 보존 문제 대응

탭 추가 후 HMR로 컴포넌트 재마운트 없이 상태가 보존될 때,
새 탭의 `inputs[id]`가 `undefined`가 되는 문제를 lazy init으로 방지:

```typescript
function handleTabChange(id: string) {
  setInputs((prev) => {
    if (prev[id] != null) return prev          // 이미 있으면 그대로
    const t = TABS.find((t) => t.id === id)!
    const ageMonths = birthdateToAgeMonths(t.defaultInputs.birthdate)
    const holdMonths = ageMonths != null
      ? calcHoldMonths(t.defaultInputs.retirementAge ?? 55, t.defaultInputs.accumMonths, ageMonths)
      : t.defaultInputs.holdMonths
    return { ...prev, [id]: { ...t.defaultInputs, holdMonths } }
  })
  setActiveId(id)
  setEditDraft(null)
  setSaveMsg(null)
}
```

---

## 알려진 제약 사항

- `deleteSimulation` 서버 액션에 권한 체크 없음 — 내부 신뢰 도구 전제
- `ccAnnualRate` 모델은 고정 월 프리미엄 가산 방식 (실제 커버드콜은 변동)
- IRP 안전자산은 단일 연이율로 단순화 (실제는 상품별 금리 상이)
- 시뮬레이션은 세금·수수료·인플레이션 미반영
