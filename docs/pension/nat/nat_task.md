# 국민연금 — 기술 사양

`app/pension/nat/` 에 있는 국민연금 페이지 전체 사양서.

---

## 파일 구조

```
app/pension/nat/
├── page.tsx      클라이언트 컴포넌트 (UI + 날짜 계산 로직)
└── actions.ts    서버 액션 (스냅샷 CRUD)
```

---

## 납부 진행 현황

### 날짜 계산 로직

```typescript
// 경과 개월 계산
const elapsedMonths = (today - startDate) in months

// 총 예상 납부 개월 (가입 시작 ~ 정년)
const totalMonths = (retirementDate - startDate) in months

// 진행률
const progress = (elapsedMonths / totalMonths) * 100
```

- 가입 시작일: 하드코딩 또는 사용자 설정값
- 정년 기준 종료일: `USER_PROFILE` 또는 환경 설정

### UI 컴포넌트

```tsx
<ProgressBar value={progress} max={100} />
<span>{elapsedMonths}개월 / {totalMonths}개월</span>
```

---

## 예상 수령액 스냅샷

### 입력 파라미터

| 필드 | 타입 | 설명 |
|------|------|------|
| `checkedAt` | string | 확인 시점 (YYYY-MM-DD) |
| `totalPaid` | number | 총 납부액 (원) |
| `monthlyGross` | number | 예상 월 수령액 세전 (원) |
| `monthlyNet` | number | 예상 월 수령액 세후 (원) |

### DB 서버 액션 (`actions.ts`)

| 액션 | 설명 |
|------|------|
| `loadSnapshots()` | 전체 스냅샷 목록 조회 (날짜 역순) |
| `addSnapshot(data)` | 스냅샷 추가 |
| `deleteSnapshot(id)` | 단건 삭제 |

---

## DB 스키마

```sql
CREATE TABLE IF NOT EXISTS nat_pension_snapshots (
  id           SERIAL PRIMARY KEY,
  checked_at   DATE         NOT NULL,
  total_paid   BIGINT,
  monthly_gross BIGINT,
  monthly_net  BIGINT,
  saved_by     VARCHAR(50),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

---

## 주요 컴포넌트

### 납부 진행 바

- 가입일~정년 기간을 100%로 환산
- 현재 날짜 기준 경과 비율 표시
- Tailwind `w-[{progress}%]` 동적 스타일 적용

### 스냅샷 이력 테이블

- 컬럼: 확인 시점 / 총 납부액 / 월 수령액(세전) / 월 수령액(세후) / 삭제
- 날짜 역순 정렬
- 금액: `toLocaleString("ko-KR")` 포맷

---

## 알려진 제약 사항

- 납부 시작일·정년 등 개인 정보가 코드에 하드코딩됨
- 스냅샷 삭제에 권한 체크 없음 (내부 신뢰 도구 전제)
- 수동 입력 기반 — 국민연금 공단 API 미연동
