# 미국 경제지표 — 프로젝트 개요

## 개요

FRED(미국 연방준비제도 경제 데이터), 미국 재무부 TIC, Frankfurter API 환율 데이터를 수집하여
미국 거시경제 주요 지표 추세를 표와 차트로 시각화하는 투자 분석 화면.
수집기는 `pensions/collector/usa/`에 구현 완료.

- 경로: `/invest/usa`
- 상태: **구현 완료**
- 수집기 문서: [usa_collector_task.md](usa_collector_task.md)
- 기술 사양: [usa_task.md](usa_task.md)

---

## 메뉴 구조

```
/invest/usa                         미국 경제지표
├── /invest/usa                     대시보드 (6개 지표 최신값 카드)
├── /invest/usa/indicator           지표별 시계열 차트
├── /invest/usa/treasury            미국 국채 보유 현황 (일본·중국)
└── /invest/usa/fx                  USD/KRW 환율 추이
```

---

## 화면별 기능

### 대시보드 (`/invest/usa`)

| 기능 | 설명 |
|------|------|
| 지표 카드 | 6개 FRED 지표별 최신값 + 전월 대비 변화 |
| 미니 스파크라인 | 최근 12개월 추이 |
| 수집 관리 패널 | admin 전용 — 수동 수집 트리거 버튼 + 수집기별 마지막 실행 이력 테이블 |

### 지표별 시계열 (`/invest/usa/indicator`)

| 기능 | 설명 |
|------|------|
| 지표 선택 | 6개 FRED 지표 드롭다운 |
| 기간 선택 | 1년 / 3년 / 5년 / 전체 |
| 시계열 차트 | 라인 차트 (Recharts) |
| 상세 테이블 | 날짜, 값, 전월 대비 변화율 |

### 미국 국채 보유 현황 (`/invest/usa/treasury`)

| 기능 | 설명 |
|------|------|
| 일본·중국 보유액 비교 | 이중 라인 차트 (USD 십억 달러) |
| 원화 환산 표시 | KRW 조원 병행 표시 (t_fx_rate 기준) |
| 단위 토글 | USD / KRW 전환 버튼 |
| 기간 선택 | 1년 / 2년 / 5년 / 전체 |
| 상세 테이블 | 날짜, 일본/중국 USD·KRW 금액 |

### USD/KRW 환율 추이 (`/invest/usa/fx`)

| 기능 | 설명 |
|------|------|
| 일별 환율 라인 차트 | Recharts + 기간 평균 기준선 |
| 기간 선택 | 1년 / 2년 / 5년 / 전체 |
| 요약 카드 | 최근 환율, 전일 대비, 기간 평균 |
| 상세 테이블 | 날짜, 환율, 전일 대비 변화 |
| 수집 관리 패널 | admin 전용 — 수동 수집 트리거 버튼 |

---

## 수집 지표 목록

| 코드 | 이름 | 단위 | 소스 |
|------|------|------|------|
| PCEPI | 미국 PCE 물가지수 | Index | FRED |
| PAYEMS | 미국 비농업고용지수(NFP) | 천명 | FRED |
| UNRATE | 미국 실업률 | % | FRED |
| GS10 | 미국 10년물 국채금리 | % | FRED |
| GS30 | 미국 30년물 국채금리 | % | FRED |
| MORTGAGE30US | 미국 모기지 금리 | % | FRED |
| FEDFUNDS | 미국 기준금리 | % | FRED (DFEDTARU — 목표 상한, FOMC 발표일 기준) |
| USD/KRW | 원달러 환율 | 원 | Frankfurter API |
| JPN | 일본 미국채 보유액 | 십억 달러 | US Treasury TIC |
| CHN | 중국 미국채 보유액 | 십억 달러 | US Treasury TIC |

---

## 변경 이력

| 시점 | 내용 |
|------|------|
| 2026-05 | 수집기 구현 완료 (FRED + FX + TIC) |
| 2026-05 | UI 화면 구현 완료 (대시보드, 시계열, 국채, 환율) |
| 2026-05 | 수동 트리거 + node-cron 자동 스케줄 구현 |
| 2026-05 | NAPM 제거 (FRED 시리즈 미존재) |
| 2026-05 | TIC 소스 변경: mfh.txt → slt_table5.txt + slt_table6.txt (61개월 이력) |
| 2026-05 | 환율 소스 변경: 한국수출입은행 → Frankfurter API / exchange_rate 테이블 → t_fx_rate |
| 2026-05 | 환율 화면 일별 데이터로 전환, 전일 대비 표시 |
| 2026-05 | FEDFUNDS: FEDFUNDS(월 평균) → DFEDTARU(목표 상한) 교체, FOMC 발표일 기준 저장 방식 도입 |
| 2026-05 | GS10/GS30: GS10/GS30(월 평균) → DGS10/DGS30(일별 EOP 월말) 교체 |
| 2026-05 | 경제 지표 차트 BarChart 전환, 지표별 Investing.com 링크 추가 |
| 2026-05 | CLAUDE.md에 수집기 변경 사전 체크 4대 규칙 추가, /collect-precheck 스킬 등록 |

---

## To-Be 개선 방향

- 지표 간 상관관계 차트 (예: 기준금리 vs 모기지금리)
- 지표 이상치 알림
- 지표 추가 (CPI, GDP 등)
