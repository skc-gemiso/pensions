# 글로벌 ETF — 프로젝트 개요

## 개요

BlackRock iShares ETF(IEMG, EEM, EWY) 보유 종목 데이터를 수집·저장하고,
종목별 주가·비중 추이 및 수량 변동을 분석하는 투자 분석 화면.
기존 stock_analysis 프로젝트에서 이전(migration).

- 경로: `/invest/etf`
- 상태: **이전 예정** (stock_analysis → pensions)
- 수집기 문서: [etf_collector_task.md](etf_collector_task.md)
- 기술 사양: [etf_task.md](etf_task.md)

---

## 메뉴 구조

```
/invest/etf                         글로벌 ETF
├── /invest/etf                     수집 이력 · 수동 수집 실행
├── /invest/etf/holdings            종목 주가 조회
├── /invest/etf/analysis
│   ├── price-rise                  주가 상승 분석
│   └── volume-change               수량 변동 분석
└── /invest/etf/recommend           추천 종목
```

---

## 화면별 기능

### 수집 이력 (`/invest/etf`)

| 기능 | 설명 |
|------|------|
| 수집 이력 테이블 | ETF, 기준일, 수집 시각, 상태, 종목 수, 메모 |
| 수동 수집 실행 | 버튼 클릭 → Python 수집기 실행 + 실행 중 상태 표시 |
| 자동 수집 | 서버 시작 시 node-cron 등록 (매일 09:00) |

### 종목 주가 조회 (`/invest/etf/holdings`)

| 기능 | 설명 |
|------|------|
| ETF 소개 카드 | IEMG/EEM/EWY 설명 + iShares 최신 자료 보기 링크 (3열 그리드, 선택 ETF 기준 투명도 조절) |
| ETF 선택 | 전체 ETF(기본) / IEMG / EEM / EWY |
| 한국 종목 필터 | country=KR 필터 토글 (기본: 한국 종목만) |
| 종목 검색 | 포커스 시 t_stock_list default_yn='Y' 기본 종목 표시 (listed_shares DESC), 입력 시 필터링 |
| 기간 선택 | 1개월 / 3개월 / 6개월(기본) / 1년 / 전체 |
| ETF 요약 카드 | ETF별 보유금액(KRW)·증감·분석기간·기초금액·비중·종목당평균 (3열 그리드, `getEtfSummary` 사용) |
| 요약 테이블 | 5열(항목/기초/기말/변화/변동(%)) × 4행(주가/비중/수량/투자금액), 종목명·티커·위치 헤더 |
| 주가·비중 추이 차트 | StockSeriesPanel — 주가 추이 + 비중(%) 추이 (2열 그리드) |
| 종목 추세 차트 | StockSeriesPanel — 주가·비중·수량·금액 4지표 0~100 정규화 비교 |
| 상세 테이블 | StockSeriesPanel — 날짜, 주가(KRW/USD병기), 주가변동, 비중, 비중변동(%), 보유수량, 수량변동, 총보유금액, 금액변동 |

### 주가 상승 분석 (`/invest/etf/analysis/price-rise`)

| 기능 | 설명 |
|------|------|
| ETF 소개 카드 | IEMG/EEM/EWY 설명 + iShares 최신 자료 보기 링크 |
| ETF 선택 | 전체 ETF(기본) / IEMG / EEM / EWY |
| 기간 선택 | 1개월 / 3개월 / 6개월(기본) / 1년 / 전체 — 서버에서 해당 기간 데이터만 집계 |
| ETF 요약 카드 | ETF별 보유금액(KRW)·증감·분석기간·기초금액·비중·종목당평균 |
| 주가 상승(%) TOP 20 | 선택 기간 내 상승(%) 상위 20개 종목, 7행 고정 높이 스크롤 표 (화면 열리면 1위 자동 선택) |
| 선택 종목 상세 | 행 클릭 → 요약 테이블 + StockSeriesPanel(주가·비중 추이 + 종목 추세 + 상세 테이블) |

### 수량 변동 분석 (`/invest/etf/analysis/volume-change`)

| 기능 | 설명 |
|------|------|
| ETF 소개 카드 | IEMG/EEM/EWY 설명 + iShares 최신 자료 보기 링크 |
| ETF 선택 | 전체 ETF(기본) / IEMG / EEM / EWY |
| 기간 선택 | 1개월 / 3개월 / 6개월(기본) / 1년 / 전체 — 서버에서 해당 기간 데이터만 집계 |
| ETF 요약 카드 | ETF별 보유금액(KRW)·증감·분석기간·기초금액·비중·종목당평균 |
| 수량 변동(%) TOP 20 | 선택 기간 내 수량 변동 상위 20개 종목, 7행 고정 높이 스크롤 표 (화면 열리면 1위 자동 선택) |
| 선택 종목 상세 | 행 클릭 → 요약 테이블 + StockSeriesPanel(주가·비중 추이 + 종목 추세 + 상세 테이블) |

### 추천 종목 (`/invest/etf/recommend`)

| 기능 | 설명 |
|------|------|
| ETF 소개 카드 | IEMG/EEM/EWY 설명 + iShares 최신 자료 보기 링크 |
| ETF 선택 | 전체 ETF(기본) / IEMG / EEM / EWY |
| 기간 선택 | 1개월 / 3개월 / 6개월(기본) / 1년 / 전체 — 서버에서 해당 기간 데이터만 집계 |
| ETF 요약 카드 | ETF별 보유금액(KRW)·증감·분석기간·기초금액·비중·종목당평균 |
| 종목 스코어링 | 조회 결과 내 상대평가 — 비중증가(0~35pt) + 수량증가(0~35pt) + 주가변동(0~30pt), 시간감쇠 블렌딩 |
| 추천 카드 그리드 | 점수 뱃지 + 요약 테이블 5열(항목/기초/기말/변화/변동(%)) × 4행(주가/비중/수량/투자금액) |
| 카드 선택 | 클릭 → 미니카드 + 요약 테이블 + StockSeriesPanel(주가·비중 추이 + 종목 추세 + 상세 테이블); 재클릭 → 해제 |

---

## 수집 대상 ETF

| ETF | 이름 | 특징 |
|-----|------|------|
| IEMG | iShares Core MSCI Emerging Markets | 신흥국 광범위 |
| EEM | iShares MSCI Emerging Markets | 신흥국 표준 |
| EWY | iShares MSCI South Korea Capped | 한국 특화 |

---

## 변경 이력

| 시점 | 내용 |
|------|------|
| stock_analysis 초기 구현 | IEMG/EEM/EWY 수집·분석 기능 완성 |
| 이전 예정 | pensions 프로젝트 `/invest/etf` 경로로 통합 |
| 2026-05 | 전 화면 요약 카드 → 요약 테이블(항목/기초/기말/변화/변동(%)) 통일; 추천 카드에 투자금액(억원) 행 추가 |
| 2026-05 | `lib/fmt.ts` 공유 유틸 도입 — 모든 ETF 화면에서 fmt/cc import 통일 |
| 2026-05 | ETF 소개 카드 + iShares 최신 자료 보기 링크 4개 화면 공통 추가 |
| 2026-05 | ETF 요약 카드(보유금액·증감·분석기간) 4개 화면 공통 추가 |
| 2026-05 | 주가·비중 추이 + 종목 추세 + 상세 테이블 → `StockSeriesPanel` 공통 컴포넌트로 추출 |

---

## To-Be 개선 방향

- 수집 대상 ETF 추가 (설정 파일 기반)
- 시계열 데이터 증감 알림
- 다중 ETF 동시 비교 화면
