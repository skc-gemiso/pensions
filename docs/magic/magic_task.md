# 복리의 마법 — 기술 사양

`app/magic/` 에 있는 복리 계산기 페이지 전체 사양서.

---

## 파일 구조

```
app/magic/
└── page.tsx      클라이언트 컴포넌트 (계산 로직 + Recharts 차트)
```

---

## 입력 파라미터

| 필드 | 타입 | 기본값 | 제약 |
|------|------|--------|------|
| `initialAmount` | number | 10,000,000 | step: 1,000,000 |
| `monthlyContrib` | number | 300,000 | step: 100,000 |
| `annualRate` | number | 7 | 0 ~ 30, step: 0.5 |
| `years` | number | 30 | 1 ~ 50 |

모두 `useState`로 관리, 변경 즉시 차트 재계산.

---

## 계산 로직 (`useMemo`)

```typescript
const chartData = useMemo(() => {
  const data = []
  let balance = initialAmount
  const monthlyRate = annualRate / 100 / 12
  let totalContrib = initialAmount

  for (let y = 0; y <= years; y++) {
    data.push({ year: `${y}년`, balance: Math.round(balance), totalContrib: Math.round(totalContrib) })
    if (y < years) {
      for (let m = 0; m < 12; m++) {
        balance = balance * (1 + monthlyRate) + monthlyContrib
        totalContrib += monthlyContrib
      }
    }
  }
  return data
}, [initialAmount, monthlyContrib, annualRate, years])
```

- 연 단위로 데이터 포인트 생성 (0년 ~ N년, 총 `years + 1`개)
- 내부 루프는 월 단위 복리 적용 후 납입액 추가

---

## 결과 수치

```typescript
const finalBalance = chartData[chartData.length - 1]?.balance ?? 0
const finalContrib = chartData[chartData.length - 1]?.totalContrib ?? 0
const totalReturn = finalBalance - finalContrib
```

---

## 숫자 포맷 (`formatKRW`)

```typescript
function formatKRW(value: number) {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`
  if (value >= 10_000)      return `${(value / 10_000).toFixed(0)}만`
  return `${value.toLocaleString()}`
}
```

---

## 차트 구성 (Recharts)

| 요소 | 설정 |
|------|------|
| 컴포넌트 | `LineChart` + `ResponsiveContainer` |
| 크기 | 100% 너비, 360px 높이 |
| X축 | `year` (0년~N년), `interval: Math.floor(years / 5)` |
| Y축 | `formatKRW` 포맷터 |
| 평가액 라인 | `stroke: #3b82f6`, `strokeWidth: 2`, 점 없음 |
| 납입액 라인 | `stroke: #d1d5db`, `strokeDasharray: "4 4"` |
| Tooltip | 원 단위 포맷 + 한글 레이블 |

---

## 레이아웃

```
lg 이상: 3컬럼 그리드
  - 왼쪽 1칸: 입력 폼 + 결과 요약 카드
  - 오른쪽 2칸: 라인 차트

모바일: 단일 컬럼 (입력 → 요약 → 차트 순)
```

---

## 알려진 제약 사항

- 저장 기능 없음 (시뮬레이션 결과 DB 저장 미구현)
- 단일 수익률만 입력 가능 (시나리오 비교 미지원)
- 세금·수수료·인플레이션 미반영
- 입력값 유효성 검증 없음 (음수, 0, 극단값 입력 가능)
