# 연금 관리 플랫폼 — 전체 프로젝트 개요

## 프로젝트 목적

개인 연금(국민연금·퇴직연금·개인연금·노령연금)의 현황을 한 곳에서 파악하고,
ETF 기반 장기 투자 시뮬레이션을 통해 퇴직 후 자산·배당 계획을 수립하는 웹 애플리케이션.

---

## 메뉴 구조

```
/ (홈)
└── /pension                     나의 연금 현황
    ├── /pension/my              대시보드 (각 연금 네비게이션)
    ├── /pension/nat             국민연금
    ├── /pension/ret             퇴직연금
    ├── /pension/per             개인연금 (진행 중)
    └── /pension/seni            노령연금 (진행 중)
/sim                             연금투자 시뮬레이션 (ETF 비교)
/magic                           복리의 마법 (복리 계산기)
/assets                          자산 (admin 전용)
└── /assets/stock                주식 투자 (my_stock / t_stock_amt)
/invest                                  투자 분석
├── 글로벌 ETF 분석 (etf-group)
│   ├── /invest/etf                      글로벌 ETF 데이터 수집 (IEMG·EEM·EWY 보유 종목)
│   ├── /invest/etf/holdings             종목 주가 조회
│   ├── /invest/etf/analysis/price-rise  주가 상승 분석
│   ├── /invest/etf/analysis/volume-change 수량 변동 분석
│   └── /invest/etf/recommend            추천 종목
└── 미국 경제 지표 분석 (usa-group)
    ├── /invest/usa                      미국 경제 지표 수집
    ├── /invest/usa/indicator            지표별 시계열
    ├── /invest/usa/treasury             미국 국채 보유
    └── /invest/usa/fx                   원/달러 환율 조회
/login                           로그인
/register                        회원가입
```

---

## 메뉴별 주요 기능 및 참고 파일

### 나의 연금 현황 (`/pension/my`)

| 기능 | 설명 |
|------|------|
| 연금 종류별 네비게이션 | 국민연금·퇴직연금·개인연금·노령연금 카드 링크 |

- 참고 파일: [app/pension/my/page.tsx](../app/pension/my/page.tsx)
- 컴포넌트: `NationalPensionNavCard`, `RetirementNavCard`
- 상세 문서: [pension/my/my_project.md](pension/my/my_project.md)

---

### 국민연금 (`/pension/nat`)

| 기능 | 설명 |
|------|------|
| 납부 진행 현황 | 가입 시작~예상 종료 기간 진행 바 |
| 예상 수령액 스냅샷 | 확인 시점별 총 납부액 + 월 수령액(세전/세후) 기록 |
| 수령액 변화 추이 | 스냅샷 이력 테이블 |
| 스냅샷 CRUD | 추가 / 삭제 |

- 참고 파일: [app/pension/nat/page.tsx](../app/pension/nat/page.tsx), [app/pension/nat/actions.ts](../app/pension/nat/actions.ts)
- 상세 문서: [pension/nat/nat_project.md](pension/nat/nat_project.md)

---

### 퇴직연금 (`/pension/ret`)

| 기능 | 설명 |
|------|------|
| 근속 진행 현황 | 입사일~정년(2034) 진행 바 |
| 퇴직금 예상 계산 | 퇴직소득세(2023년 개정) 포함 세전/세후 |
| 연도별 퇴직금 테이블 | 2026~2034 시점별 예상 퇴직금 |
| IRP 운용 시뮬레이션 | KODEX 커버드콜 70% + TDF 30% 배당 시뮬 |

- 참고 파일: [app/pension/ret/page.tsx](../app/pension/ret/page.tsx)
- 상세 문서: [pension/ret/ret_project.md](pension/ret/ret_project.md)

---

### 개인연금 (`/pension/per`) — 진행 중

| 기능 | 설명 |
|------|------|
| 연금저축펀드 평가액 | 미구현 (UI 골조만) |
| IRP 평가액 | 미구현 |
| ISA 평가액 | 미구현 |
| 시뮬레이터 링크 | `/sim` 이동 |
| 복리의 마법 링크 | `/magic` 이동 |

- 참고 파일: [app/pension/per/page.tsx](../app/pension/per/page.tsx)
- 상세 문서: [pension/per/per_project.md](pension/per/per_project.md)

---

### 노령연금 (`/pension/seni`) — 진행 중

| 기능 | 설명 |
|------|------|
| 수급 조건 안내 | 수급 연령, 최소 가입 기간 |
| 조기노령연금 안내 | 감액률 안내 |
| 연기노령연금 안내 | 증액률 안내 |
| 추정 계산 | 미구현 (입력 유도 메시지만) |

- 참고 파일: [app/pension/seni/page.tsx](../app/pension/seni/page.tsx)
- 상세 문서: [pension/seni/seni_project.md](pension/seni/seni_project.md)

---

### 연금저축펀드 시뮬레이션 (`/sim`)

| 기능 | 설명 |
|------|------|
| ETF 시뮬레이션 | KODEX200 vs 타겟위클리커버드콜 ETF 비교 |
| IRP 시뮬레이션 | 안전자산 30% + ETF 70% 의무 비율 적용 |
| 6개 수익률 시나리오 | -20% ~ +20% 시나리오별 적립금·퇴직금·월배당 |
| 탭별 파라미터 | 수익율 확인 / IRP 수익율 확인 |
| 시뮬레이션 저장·조회·삭제 | DB 기반 이력 관리 |
| 헬프 모달 | 초보 가이드, 계좌 유형, 투자 기준, 화면 안내 |

- 참고 파일: [app/sim/page.tsx](../app/sim/page.tsx), [app/sim/actions.ts](../app/sim/actions.ts)
- 상세 문서: [sim/sim_project.md](sim/sim_project.md), [sim/sim_task.md](sim/sim_task.md)

---

### 복리의 마법 (`/magic`)

| 기능 | 설명 |
|------|------|
| 복리 계산 | 초기 투자금 + 월 납입액 + 연 수익률 + 기간 → 최종 평가액 |
| 자산 성장 차트 | 연도별 평가액 vs 납입액 라인 차트 (Recharts) |
| 결과 요약 | 최종 평가액 / 총 납입액 / 수익(복리 효과) |

- 참고 파일: [app/magic/page.tsx](../app/magic/page.tsx)
- 상세 문서: [magic/magic_project.md](magic/magic_project.md), [magic/magic_task.md](magic/magic_task.md)

---

### 주식 투자 (`/assets/stock`) — admin 전용

| 기능 | 설명 |
|------|------|
| 포트폴리오 현황 | my_stock 잔고 기반 보유 종목 + t_stock_amt 최신 저장가로 평가금액·손익·수익률 표시 |
| 코스피·코스닥 지수 | 보유 종목 테이블 헤더에 실시간 지수 현황 표시 |
| 종목별 주가 차트 | 종목 클릭 시 t_stock_amt 일별 주가 라인 차트 (기간 필터: 1개월/3개월/6개월/1년/전체) |
| 차트 하단 일자별 테이블 | 날짜·종가·전일대비·등락률 스크롤 테이블 |
| 네이버 주가 가져오기 | sise_day.naver HTML 파싱으로 증분 수집 → t_stock_amt UPSERT |
| 자동 수집 스케줄 | Vercel Cron 매일 20:30 KST (`/api/cron/stock-sync`) |
| 매입/매도 내역 추가 | my_stock에 거래 내역 입력 (구분/일자 달력/t_stock_list 종목 검색/유형/단가/수량) |
| 거래 내역 조회·삭제 | 전체 거래 내역 테이블 + 개별 삭제 |
| 매입 내역 호버 툴팁 | 보유 종목 행 호버 시 매입일·수량·매입가·현재가·수익률 툴팁 표시 |

- 참고 파일: [app/assets/stock/page.tsx](../app/assets/stock/page.tsx), [app/assets/stock/actions.ts](../app/assets/stock/actions.ts)
- 리다이렉트: [app/assets/page.tsx](../app/assets/page.tsx) → `/assets/stock`
- Cron 엔드포인트: [app/api/cron/stock-sync/route.ts](../app/api/cron/stock-sync/route.ts)
- API 라우트 (미사용): [app/api/stock/price/route.ts](../app/api/stock/price/route.ts), [app/api/stock/daily/route.ts](../app/api/stock/daily/route.ts), [app/api/stock/search/route.ts](../app/api/stock/search/route.ts)
- 독립 스크립트: [scripts/sync-stock-prices.mjs](../scripts/sync-stock-prices.mjs)
- Vercel 설정: [vercel.json](../vercel.json)
- DB 마이그레이션: `v015_add_stock_menu` (lib/auth-db.ts)
- 상세 문서: [assets/stock/stock_project.md](assets/stock/stock_project.md), [assets/stock/stock_task.md](assets/stock/stock_task.md)

---

### 글로벌 ETF (`/invest/etf`) — 이전 예정

| 기능 | 설명 |
|------|------|
| 수집 이력 | ETF 보유 종목 수집 이력 조회·수동 실행 |
| 종목 주가 조회 | IEMG/EEM/EWY 종목 검색 + 주가·비중 추이 차트 |
| 주가 상승 분석 | 수집 기간 내 상승률 TOP 20 바차트 |
| 수량 변동 분석 | 보유 수량 변동폭 TOP 20 바차트 |
| 추천 종목 | 비중·수량·주가 모멘텀 기반 스코어링 카드 |

- 참고 파일: [app/invest/etf/](../app/invest/etf/) (이전 예정)
- 수집기: [collector/etf/](../collector/etf/) (이전 예정)
- 상세 문서: [invest/etf/etf_project.md](invest/etf/etf_project.md), [invest/etf/etf_task.md](invest/etf/etf_task.md)

---

### 미국 경제지표 (`/invest/usa`) — 구현 완료

| 메뉴 ID | 경로 | 기능 |
|---------|------|------|
| `usa` | `/invest/usa` | FRED 7개 지표 최신값 카드 + 스파크라인 대시보드 |
| `usa-indicator` | `/invest/usa/indicator` | 지표 선택 + 기간 필터 + 시계열 차트 + 테이블 |
| `usa-treasury` | `/invest/usa/treasury` | 일본·중국 미국 국채 보유액 이중 라인 차트 (USD/KRW 전환) |
| `usa-fx` | `/invest/usa/fx` | 원/달러 환율 조회 월별 환율 차트 + 평균 기준선 + 테이블 |

- 참고 파일: [app/invest/usa/](../app/invest/usa/)
- 수집기: [collector/usa/](../collector/usa/) (완성)
- DB 마이그레이션: `v012_add_invest_usa_menus` (lib/auth-db.ts)
- 상세 문서: [invest/usa/usa_project.md](invest/usa/usa_project.md), [invest/usa/usa_task.md](invest/usa/usa_task.md)

---

## 공통 내용

### 인증 및 접근 제어

- NextAuth v5 (Credentials Provider + JWT 세션)
- DB 기반 사용자 관리 (`lib/auth-db.ts`)
- 역할(role): `admin`, `khj`, 일반 사용자
  - `admin` / `khj`: 시뮬레이션 전체 탭 접근
  - 일반 사용자: 공개 탭(`reference`, `irp-reference`)만 접근
- 로그인 경로: `/login` / 미인증 시 자동 리다이렉트
- 회원가입: `/register`

### 레이아웃 및 네비게이션

- 공통 사이드바 레이아웃: [components/AppLayout.tsx](../components/AppLayout.tsx)
- 상단/사이드 네비게이션, 로그아웃 버튼 포함

### 데이터베이스

- 일반 DB: `lib/auth-db.ts` (사용자 관리), `lib/pension-db.ts` (연금 데이터)
- 시뮬레이션 DB: Supabase PostgreSQL (`pension_sim_savings_fund` 테이블)
- 기술 상세: [environment.md](environment.md)

### 서버 액션

| 파일 | 용도 |
|------|------|
| [app/actions/auth.ts](../app/actions/auth.ts) | 로그인·로그아웃 |
| [app/actions/visitor.ts](../app/actions/visitor.ts) | 방문자 기록 |
| [app/pension/nat/actions.ts](../app/pension/nat/actions.ts) | 국민연금 스냅샷 CRUD |
| [app/sim/actions.ts](../app/sim/actions.ts) | 시뮬레이션 저장·조회·삭제, IP 기록 |

---

## To-Be 개선 방향

### 단기

| 항목 | 설명 |
|------|------|
| 개인연금 평가액 연동 | 연금저축펀드·IRP·ISA 실제 잔액 데이터 입력/관리 |
| 노령연금 계산 구현 | 국민연금 데이터 기반 예상 수령액 자동 계산 |
| 퇴직연금 개인화 | `USER_PROJECTIONS` 하드코딩 제거, DB 기반 관리 |

### 중기

| 항목 | 설명 |
|------|------|
| Vercel 배포 | GitHub 연동, 환경 변수 등록, E2E 검증 |
| 모바일 UI 개선 | 반응형 레이아웃 최적화 |
| 시뮬레이션 공유 | 저장된 시뮬레이션 URL 공유 기능 |

### 장기

| 항목 | 설명 |
|------|------|
| 금융 API 연동 | 실시간 ETF 가격·배당 데이터 자동 갱신 |
| 포트폴리오 리밸런싱 알림 | 목표 비율 이탈 시 알림 |
| 세후 수익 정밀 계산 | 계좌 유형별 세금 상세 적용 |
