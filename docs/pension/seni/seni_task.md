# 노령연금 — 기술 사양 및 구현 계획

`app/pension/seni/` 에 있는 노령연금 페이지 사양서.
현재 안내 UI만 구현된 상태이며, 이 문서는 향후 구현 계획을 포함한다.

---

## 파일 구조

```
app/pension/seni/
└── page.tsx      클라이언트 컴포넌트 (현재 안내 UI)
```

---

## 현재 구현 상태

### 안내 카드 구성

```tsx
const INFO_CARDS = [
  {
    title: "노령연금 수급 조건",
    items: ["최소 가입 기간: 10년", "수급 개시 연령: 출생연도별 상이"],
  },
  {
    title: "조기노령연금",
    items: ["최대 5년 앞당겨 수령 가능", "1년 앞당길 때마다 6% 감액"],
  },
  {
    title: "연기노령연금",
    items: ["최대 5년 연기 수령 가능", "1년 연기할 때마다 7.2% 증액"],
  },
]
```

---

## 구현 계획

### Phase 1 — 개인 기본 정보 입력

#### 입력 파라미터

| 필드 | 타입 | 설명 |
|------|------|------|
| `birthYear` | number | 출생연도 |
| `startWorkYear` | number | 국민연금 가입 시작 연도 |
| `expectedRetireYear` | number | 예상 수령 개시 연도 |
| `expectedMonthly` | number | 예상 월 수령액 (국민연금 조회 기준) |

#### 수급 개시 연령 계산

```typescript
function getEligibleAge(birthYear: number): number {
  if (birthYear <= 1952) return 60
  if (birthYear <= 1956) return 61
  if (birthYear <= 1960) return 62
  if (birthYear <= 1964) return 63
  if (birthYear <= 1968) return 64
  return 65
}
```

---

### Phase 2 — 수령 시나리오 계산

#### 감액/증액 계산

```typescript
// 조기 수령 (최대 5년, 연 6% 감액)
function earlyAmount(base: number, yearsEarly: number): number {
  const clipped = Math.min(yearsEarly, 5)
  return base * (1 - clipped * 0.06)
}

// 연기 수령 (최대 5년, 연 7.2% 증액)
function deferredAmount(base: number, yearsDeferred: number): number {
  const clipped = Math.min(yearsDeferred, 5)
  return base * (1 + clipped * 0.072)
}
```

#### 시나리오 결과 구조

```typescript
interface ScenarioResult {
  strategy: "early" | "normal" | "deferred"
  startAge: number
  monthlyAmount: number
  totalByAge80: number   // 80세까지 총 수령액
  totalByAge90: number   // 90세까지 총 수령액
}
```

---

### Phase 3 — 국민연금 데이터 연동

- `/pension/nat` 의 최신 스냅샷(`monthlyGross`) 자동 가져오기
- 별도 입력 없이 예상 수령액 자동 반영

---

## 알려진 제약 사항

- 현재 계산 기능 없음 — 안내 텍스트만 표시
- 수급 개시 연령표는 2024년 기준 (향후 법 개정 시 갱신 필요)
- 조기/연기 감액률은 현행 기준 (법 개정 가능)
