# 연금 관리 플랫폼 — 전체 프로젝트 개요

## 프로젝트 목적

개인 연금(국민연금·퇴직연금·개인연금)의 현황을 한 곳에서 파악하고,
ETF 기반 장기 투자 시뮬레이션을 통해 퇴직 후 자산·배당 계획을 수립하는 웹 애플리케이션.

---

## 메뉴 구조

```
/ (홈)
└── /pension                     나의 연금 현황
    ├── /pension/my              대시보드 (각 연금 네비게이션)
    ├── /pension/nat             국민연금
    ├── /pension/ret             퇴직연금
    └── /pension/per             개인연금 (연금저축펀드 수령액 시뮬레이션)
/sim                             연금투자 시뮬레이션 (ETF 비교)
/magic                           복리의 마법 (복리 계산기)
/invest                                  투자
├── 글로벌 ETF 분석 (etf-group)
│   ├── /invest/etf                      글로벌 ETF 데이터 수집 (IEMG·EEM·EWY 보유 종목)
│   ├── /invest/etf/holdings             종목 주가 조회
│   ├── /invest/etf/analysis/price-rise  주가 상승 분석
│   ├── /invest/etf/analysis/volume-change 수량 변동 분석
│   └── /invest/etf/recommend            추천 종목
├── 미국 경제 지표 분석 (usa-group)
│   ├── /invest/usa                      미국 경제 지표 수집
│   ├── /invest/usa/indicator            지표별 시계열
│   ├── /invest/usa/treasury             미국 국채 보유
│   └── /invest/usa/fx                   원/달러 환율 조회
└── /assets/stock                        주식 투자 (my_stock / t_stock_amt)
/life                            생활 (→ /life/cost 리다이렉트)
├── /life/cost                   생활비 관리 (가계부)
└── /shopping                    쇼핑 (구매 목록 + 참고 자료)
/login                           로그인
/register                        회원가입
```

> `자산(/assets)` 최상위 메뉴는 **재구성 예정이라 숨겨 뒀다** (v030 — 메뉴 행은 남기고 권한만 회수).
> 주식 투자 화면 경로는 `/assets/stock` 그대로 두고 메뉴 위치만 `투자` 하위로 옮겼다.

---

## 메뉴별 주요 기능 및 참고 파일

### 나의 연금 현황 (`/pension/my`)

| 기능 | 설명 |
|------|------|
| 세 연금 합산 요약 | 63세부터 받는 월 수령액 + 연금별 비중 |
| 수령 시점별 월 소득 | 63세(개인+퇴직) → 65세(+국민) 구간별 스택 바 |
| 연금별 카드 | 월 수령액 / 적립 현황 / 진행률 + 각 화면 링크 |
| 도움말 | 무엇을 모았나 / 공통 전제 / ⚠️ 한계 |

- 참고 파일: [app/pension/my/page.tsx](../app/pension/my/page.tsx), [app/pension/my/actions.ts](../app/pension/my/actions.ts)
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
| 근속 진행 현황 | 입사일~정년(2034.06) 진행 바 |
| 퇴직금 예상 계산 | 퇴직소득세(2023년 개정) 포함 세전/세후 |
| 연도별 퇴직금 테이블 | 2026~2034 시점별 예상 퇴직금 |
| 커버드콜 운용 시뮬레이션 | 퇴직 시점에 퇴직금 전액으로 KODEX 200 타겟위클리커버드콜 매입 → 63세까지 재투자 → 63세부터 월·연 분배금. 만 55세 이전 퇴직은 IRP 의무 이전으로 제외 (IRP·ISA 미운용, DB형 기준, 세금 미반영) |

- 참고 파일: [app/pension/ret/page.tsx](../app/pension/ret/page.tsx)
- 상세 문서: [pension/ret/ret_project.md](pension/ret/ret_project.md)

---

### 개인연금 (`/pension/per`)

연금저축펀드 계좌(`201-04-931585`) 하나가 재원. IRP·ISA 는 다루지 않는다.

| 기능 | 설명 |
|------|------|
| 계좌 현황 | 보유수량·평가액·매입금액·손익 (`my_stock`·`t_stock_amt` 실시간 조회) |
| 누적 수령 분배금 | 분배금 지급 이력 기준 실적치, 클릭 시 지급기준일별 상세 |
| 수령액 시뮬레이션 | 적립 → 거치 → 수령 3구간 월 단위 복리 계산 |
| 퇴직 시점별 비교 | 퇴직 나이만 바꿔 재계산, 기준(정년) 대비 차이 표시 |
| 연도별 추이 | 매년 12월 말 스냅샷 (수량·평가액·월 분배금) |
| 적립 계획 확인 | 생년월일·입사일·정년 + 수령 나이·월 적립액 (읽기 전용 — `config/.env` 관리) |
| 도움말 | 페이지 전체 `!` + 표별 전용 `읽는 법` 2종 |
| 시뮬레이터 링크 | `/sim` 이동 |
| 복리의 마법 링크 | `/magic` 이동 |

- 참고 파일: [app/pension/per/page.tsx](../app/pension/per/page.tsx),
  [app/pension/per/actions.ts](../app/pension/per/actions.ts),
  [lib/pension-per-calc.ts](../lib/pension-per-calc.ts)
- 상세 문서: [pension/per/per_project.md](pension/per/per_project.md)

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

### 주식 투자 (`/assets/stock`) — `투자` 메뉴 하위, admin 전용

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
| 계좌 입출금 관리 | `my_account` 계좌별 입출금 내역 조회·입력 |
| 배당 수익률 조회 | `498400` 전용 팝업 — 분배율 요약, 13일 기산 계좌별 예상 분배금, 지급 이력 테이블 |
| 분배금 추가 | 배당 팝업에서 `t_etf_dividend` 1건 등록. 엑셀 행 붙여넣기로 5개 항목 자동 분리 입력 |
| 기준일 종가 | 분배금 지급 이력에 지급기준일 종가 표시 (휴장일이면 직전 거래일) |

- 참고 파일: [app/assets/stock/page.tsx](../app/assets/stock/page.tsx), [app/assets/stock/actions.ts](../app/assets/stock/actions.ts)
- 리다이렉트: [app/assets/page.tsx](../app/assets/page.tsx) → `/assets/stock`
- Cron 엔드포인트: [app/api/cron/stock-sync/route.ts](../app/api/cron/stock-sync/route.ts)
- API 라우트 (미사용): [app/api/stock/price/route.ts](../app/api/stock/price/route.ts), [app/api/stock/daily/route.ts](../app/api/stock/daily/route.ts), [app/api/stock/search/route.ts](../app/api/stock/search/route.ts)
- 독립 스크립트: [scripts/sync-stock-prices.mjs](../scripts/sync-stock-prices.mjs)
- Vercel 설정: [vercel.json](../vercel.json)
- DB 마이그레이션: `v015_add_stock_menu`, `v030_move_stock_to_invest` (lib/auth-db.ts)
- 상세 문서: [assets/stock/stock_project.md](assets/stock/stock_project.md), [assets/stock/stock_task.md](assets/stock/stock_task.md)

---

### 글로벌 ETF (`/invest/etf`) — 구현 완료

| 기능 | 설명 |
|------|------|
| 수집 이력 | ETF 보유 종목 수집 이력 조회·수동 실행 |
| 종목 주가 조회 | IEMG/EEM/EWY 종목 검색 + 주가·비중 추이 차트 |
| 주가 상승 분석 | 수집 기간 내 상승률 TOP 20 바차트 |
| 수량 변동 분석 | 보유 수량 변동폭 TOP 20 바차트 |
| 추천 종목 | 비중·수량·주가 모멘텀 기반 스코어링 카드 |

- 참고 파일: [app/invest/etf/](../app/invest/etf/), [lib/etf-collector.ts](../lib/etf-collector.ts)
- 수집기: [collector/etf/](../collector/etf/) — Python. 수동 실행은 프로세스 spawn 방식이라 Vercel에서는 동작하지 않음
- 상세 문서: [invest/etf/etf_project.md](invest/etf/etf_project.md), [invest/etf/etf_task.md](invest/etf/etf_task.md)

---

### 쇼핑 (`/shopping`)

| 기능 | 설명 |
|------|------|
| 구매 목록 | 카테고리 필터(국내/국외/휴대폰/노트북) + 최근 30건 목록 + 우측 상세 |
| 참고 자료 | 구매 전 조사 자료 목록 (제목·카테고리·링크·내용·첨부) |
| 모드 전환 | 상단 토글로 구매 목록 ↔ 참고 자료 전환 |
| 첨부파일 | 파일 드래그·선택·이미지 붙여넣기 → Supabase Storage |
| 결제수단 | 생활비 관리 신용카드 항목 재사용 |

- 참고 파일: [app/shopping/page.tsx](../app/shopping/page.tsx), [app/shopping/actions.ts](../app/shopping/actions.ts)
- 파일 업로드: [app/api/shopping/upload/route.ts](../app/api/shopping/upload/route.ts)
- Storage 클라이언트: [lib/supabase-storage.ts](../lib/supabase-storage.ts)
- DB 마이그레이션: `v019_add_shopping_tables` (lib/auth-db.ts)
- 상세 문서: [shopping/shopping_project.md](shopping/shopping_project.md), [shopping/shopping_task.md](shopping/shopping_task.md)

---

### 생활비 관리 (`/life/cost`)

| 기능 | 설명 |
|------|------|
| 월 선택 | YYYY-MM 드롭다운, 기본값 당월 |
| 수입 대비 지출 현황 | 수입/지출/잔액 요약 (잔액 적자 시 빨간색) |
| 주요 지출 TOP 3 | 당월 금액 상위 3개 + 전월 대비 변동 |
| 최근 3개월 현황 | 월별 수입·지출 테이블 |
| 고정지출 | 항목별 월 금액 인라인 편집 + 툴팁 |
| 고정이체 & 금융 | 대출·이체 항목 + 계좌번호 툴팁 |
| 생활비 & 공과금 | item_type2(건물명) 탭 + 항목 목록 |
| 신용카드 | 카드별 결제금액 + 전월 대비 + 결제일·정산기간 (`my_card` 마스터에서 JOIN) |
| 카드 상세 관리 | 항목 관리 모달 > 신용카드 행 `[카드정보]` → 카드명·구분·결제일·정산기간 편집, 카드번호·유효기간·CVC는 암호화 저장 후 마스킹 표시 |
| 항목 추가/비활성화 | 모달로 항목 추가, 항목 마스터는 삭제 대신 비활성화 |
| 월 데이터 삭제 | 월별 표 행 ✕ → 해당 월 실적(my_cost_info)만 삭제 |
| 이전 달 복사 | 신규 월 첫 접근 시 default_amount 기준 일괄 생성 |

- 참고 파일: [app/life/cost/page.tsx](../app/life/cost/page.tsx), [app/life/cost/actions.ts](../app/life/cost/actions.ts)
- 리다이렉트: [app/life/page.tsx](../app/life/page.tsx) → `/life/cost`
- DB 마이그레이션: `v016_add_life_cost` (lib/auth-db.ts)
- 상세 문서: [life/cost/cost_project.md](life/cost/cost_project.md), [life/cost/cost_task.md](life/cost/cost_task.md)

---

### 전기요금 관리 (`/life/power`)

| 기능 | 설명 |
|------|------|
| 월별 청구 | 사용량 입력 → 계절별 누진·부가항목·할인을 계산해 청구요금 산출. 계절 일수 분해와 구간별 내역을 펼쳐서 확인 |
| 일할계산 | 청구기간이 계절 경계를 걸치면 사용량·구간상한·기본요금을 일수로 안분 (한전 방식) |
| 복지할인 | 장애인 할인 한도액도 일수 안분 후 `-min(전기요금, 한도)` 자동 적용 |
| 일별 사용량 | 사용기간을 날짜로 펼쳐 매일 입력. 합계·목표·잔여량·일평균·예상 사용량 표시, 주말 강조 |
| 요금표 관리 | 적용시작일 × 계절 단위로 구간·기본요금·단가·복지한도·부가단가 관리 (인상 대응) |

- 참고 파일: [app/life/power/page.tsx](../app/life/power/page.tsx), [app/life/power/actions.ts](../app/life/power/actions.ts), [lib/power-calc.ts](../lib/power-calc.ts)
- DB 마이그레이션: `v023_add_power` (lib/auth-db.ts)
- 상세 문서: [life/power/power_project.md](life/power/power_project.md), [life/power/power_task.md](life/power/power_task.md)

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

- **DB는 Supabase PostgreSQL 하나뿐**이다. 인증·연금·주식·ETF·생활비·쇼핑이 모두 같은 DB를 쓰고,
  연결은 [lib/pension-db.ts](../lib/pension-db.ts) 의 `getPensionPool()` 싱글턴 하나로 통일돼 있다
- 스키마 마이그레이션: [lib/auth-db.ts](../lib/auth-db.ts) 의 `ensureMigrations()` (v001~v022, 로그인 시 실행)
- 기술 상세: [environment.md](environment.md)

### 서버 액션

| 파일 | 용도 |
|------|------|
| [app/actions/auth.ts](../app/actions/auth.ts) | 로그인·로그아웃 |
| [app/actions/visitor.ts](../app/actions/visitor.ts) | 방문자 기록 |
| [app/pension/nat/actions.ts](../app/pension/nat/actions.ts) | 국민연금 스냅샷 CRUD |
| [app/sim/actions.ts](../app/sim/actions.ts) | 시뮬레이션 저장·조회·삭제, IP 기록, 시세 조회 |
| [app/assets/stock/actions.ts](../app/assets/stock/actions.ts) | 주식 거래·보유·계좌·분배금, 네이버 주가 수집 |
| [app/invest/etf/actions.ts](../app/invest/etf/actions.ts) | ETF 보유종목 분석·추천, 수집기 실행 |
| [app/invest/usa/actions.ts](../app/invest/usa/actions.ts) | 미국 지표·국채·환율 조회, 수집기 실행 |
| [app/life/cost/actions.ts](../app/life/cost/actions.ts) | 생활비 항목·월별 실적, 카드 마스터(암호화 포함) |
| [app/life/power/actions.ts](../app/life/power/actions.ts) | 전기요금 청구·일별 사용량·요금표 |
| [app/shopping/actions.ts](../app/shopping/actions.ts) | 쇼핑 구매·참고자료·첨부파일 Signed URL |

---

## To-Be 개선 방향

### 단기

| 항목 | 설명 |
|------|------|
| 개인연금 평가액 연동 | 연금저축펀드·IRP·ISA 실제 잔액 데이터 입력/관리 |
| 퇴직연금 개인화 | `USER_PROJECTIONS` 하드코딩 제거, DB 기반 관리 |

### 중기

| 항목 | 설명 |
|------|------|
| 모바일 UI 개선 | 반응형 레이아웃 최적화 |
| 시뮬레이션 공유 | 저장된 시뮬레이션 URL 공유 기능 |
| 수집기 서버리스 대응 | Python spawn 방식이라 Vercel에서 수동 실행 불가 — 외부 워커나 API 방식 검토 |

### 장기

| 항목 | 설명 |
|------|------|
| 금융 API 연동 | 실시간 ETF 가격·배당 데이터 자동 갱신 |
| 포트폴리오 리밸런싱 알림 | 목표 비율 이탈 시 알림 |
| 세후 수익 정밀 계산 | 계좌 유형별 세금 상세 적용 |
