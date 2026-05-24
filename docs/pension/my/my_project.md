# 나의 연금 현황 — 프로젝트 개요

## 개요

국민연금·퇴직연금·개인연금·노령연금 네 가지 연금 영역으로
빠르게 이동할 수 있는 대시보드 허브 화면.

- 경로: `/pension/my` (`/pension` 진입 시 자동 리다이렉트)
- 상태: **완전 구현**
- 참고 파일: [app/pension/my/page.tsx](../../app/pension/my/page.tsx)
- 컴포넌트: [components/NationalPensionDashboardCard.tsx](../../components/NationalPensionDashboardCard.tsx), [components/RetirementDashboardCard.tsx](../../components/RetirementDashboardCard.tsx)

---

## 화면 구조

```
/pension/my (나의 연금 현황)
├── 국민연금 카드 → /pension/nat
│   └── NationalPensionDashboardCard
├── 퇴직연금 카드 → /pension/ret
│   └── RetirementDashboardCard
├── 개인연금 카드 → /pension/per
└── 노령연금 카드 → /pension/seni
```

---

## 핵심 개념

### 카드 구성

각 연금 유형별로 카드 형태의 네비게이션을 제공한다.
`NationalPensionDashboardCard`, `RetirementDashboardCard`는 별도 컴포넌트로 분리되어
해당 연금의 핵심 수치를 요약 표시하고 상세 화면으로 연결한다.

---

## 변경 이력

| 시점 | 내용 |
|------|------|
| 초기 구현 | 4개 연금 네비게이션 카드 구성 |

---

## To-Be 개선 방향

- 각 카드에 핵심 수치 요약 표시 (현재 잔액, 예상 수령액 등)
- 전체 연금 합산 예상 월 수령액 표시
- 카드별 최근 업데이트 날짜 표시
