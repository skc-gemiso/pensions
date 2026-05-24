# 개인연금 — 기술 사양 및 구현 계획

`app/pension/per/` 에 있는 개인연금 페이지 사양서.
현재 UI 골조만 구현된 상태이며, 이 문서는 향후 구현 계획을 포함한다.

---

## 파일 구조

```
app/pension/per/
└── page.tsx      클라이언트 컴포넌트 (현재 UI 골조)
```

---

## 현재 구현 상태

### 계좌 현황 카드

```tsx
// 현재: 하드코딩된 빈 값
const accounts = [
  { label: "연금저축펀드", amount: null, link: "/sim" },
  { label: "IRP",         amount: null, link: "/sim" },
  { label: "ISA",         amount: null },
]
```

- 평가액은 모두 `null` → UI에서 `"- 원"` 표시
- 데이터 연동 미구현

---

## 구현 계획

### Phase 1 — 수동 입력 기반 평가액 관리

#### 입력 파라미터

| 필드 | 타입 | 설명 |
|------|------|------|
| `accountType` | `"pension_savings" \| "irp" \| "isa"` | 계좌 유형 |
| `evaluatedAt` | string | 평가 기준일 (YYYY-MM-DD) |
| `balance` | number | 평가액 (원) |
| `memo?` | string | 메모 |

#### DB 스키마 (예정)

```sql
CREATE TABLE IF NOT EXISTS personal_pension_balances (
  id            SERIAL PRIMARY KEY,
  user_id       VARCHAR(50)  NOT NULL,
  account_type  VARCHAR(30)  NOT NULL,
  evaluated_at  DATE         NOT NULL,
  balance       BIGINT       NOT NULL,
  memo          TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

#### 서버 액션 (예정)

| 액션 | 설명 |
|------|------|
| `loadBalances(userId)` | 계좌별 최신 잔액 조회 |
| `addBalance(data)` | 잔액 기록 추가 |
| `deleteBalance(id)` | 단건 삭제 |

---

### Phase 2 — 납입 이력 관리

#### 납입 이력 DB (예정)

```sql
CREATE TABLE IF NOT EXISTS personal_pension_contributions (
  id            SERIAL PRIMARY KEY,
  user_id       VARCHAR(50)  NOT NULL,
  account_type  VARCHAR(30)  NOT NULL,
  paid_at       DATE         NOT NULL,
  amount        BIGINT       NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

---

### Phase 3 — 세액공제 한도 계산기

- 총급여 입력 → 세액공제율(13.2% or 16.5%) 자동 계산
- 연금저축 + IRP 합산 한도 체크 (900만원)
- 환급 예상액 표시

---

## 알려진 제약 사항

- 현재 실제 데이터 없음 — 모든 평가액 `null`
- 시뮬레이션 링크(`/sim`)는 연결되어 있으나 이 화면과 데이터 공유 없음
