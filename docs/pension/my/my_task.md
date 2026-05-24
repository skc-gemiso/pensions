# 나의 연금 현황 — 기술 사양

`app/pension/my/` 에 있는 대시보드 페이지 전체 사양서.

---

## 파일 구조

```
app/pension/my/
└── page.tsx      클라이언트 컴포넌트 (네비게이션 카드 렌더링)

components/
├── NationalPensionDashboardCard.tsx   국민연금 대시보드 카드
└── RetirementDashboardCard.tsx        퇴직연금 대시보드 카드
```

---

## 라우트 진입 흐름

```
GET /pension
  └── app/pension/page.tsx
        └── redirect("/pension/my")   서버 컴포넌트 redirect

GET /pension/my
  └── app/pension/my/page.tsx         대시보드 렌더링
```

---

## 카드 구성

### `NationalPensionDashboardCard`

- 국민연금 납부 현황 요약 표시
- 링크: `/pension/nat`
- 표시 데이터: 납부 진행률, 최신 예상 수령액 (있는 경우)

### `RetirementDashboardCard`

- 퇴직연금 현황 요약 표시
- 링크: `/pension/ret`
- 표시 데이터: 현재 시점 예상 퇴직금 (세후)

### 개인연금 카드 (인라인)

- 링크: `/pension/per`
- 표시 데이터: 현재 "준비 중" 상태

### 노령연금 카드 (인라인)

- 링크: `/pension/seni`
- 표시 데이터: 수급 개시 연령 안내

---

## 상태 관리

- 대시보드 자체는 상태 없음 (순수 네비게이션)
- 각 카드 컴포넌트가 필요한 데이터를 서버 액션으로 독립 조회
- `Suspense` 경계로 카드별 로딩 처리 (예정)

---

## 알려진 제약 사항

- 일부 카드(`NationalPensionDashboardCard`, `RetirementDashboardCard`)의 요약 데이터 연동 수준은 컴포넌트 내부에서 관리
- 전체 연금 합산 수치 계산 미구현
