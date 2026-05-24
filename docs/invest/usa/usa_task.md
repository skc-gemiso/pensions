# 미국 경제지표 — 기술 사양

---

## 파일 구조

```
app/invest/usa/
├── page.tsx                 대시보드 (서버 컴포넌트)
├── indicator/page.tsx       지표별 시계열 (클라이언트)
├── treasury/page.tsx        미국 국채 보유 (클라이언트)
├── fx/page.tsx              환율 추이 (클라이언트)
└── actions.ts               서버 액션 (DB 조회)
```

---

## DB 스키마

테이블 생성 스크립트: [collector/sql/create_usa_tables.sql](../../../collector/sql/create_usa_tables.sql)

| 테이블 | 설명 |
|--------|------|
| `indicator_master` | 지표 메타 정보 (indicator_code, unit, fred_series_id 등) |
| `indicator_data` | 지표 시계열 데이터 (UNIQUE: indicator_code + stat_date) |
| `t_fx_rate` | USD/KRW 일별 환율 (e_date VARCHAR YYYYMMDD, fx_rate NUMERIC) |
| `treasury_holding` | 일본·중국 미국채 보유액 (USD + KRW 환산) |
| `usa_collect_log` | 수집기 실행 로그 (collector_name, status, row_count) |

> `exchange_rate` 테이블은 제거됨. 환율은 `t_fx_rate` 테이블만 사용.

---

## 서버 액션 (`app/invest/usa/actions.ts`)

| 함수 | 반환 | 설명 |
|------|------|------|
| `getIndicatorList()` | `IndicatorMeta[]` | 지표 목록 전체 (드롭다운용) |
| `getIndicatorLatest()` | `IndicatorCard[]` | 대시보드 카드용 최신값 + 스파크라인(13개월) |
| `getIndicatorSeries(code, months?)` | `{ stat_date, value }[]` | 지표 시계열 (기간 필터) |
| `getTreasurySeries(months?)` | `{ stat_date, country_code, amount_usd_billion, fx_rate, amount_krw_trillion }[]` | 국채 보유 시계열 (t_fx_rate LATERAL JOIN) |
| `getFxSeries(months?)` | `{ stat_date, exchange_rate }[]` | 환율 시계열 (t_fx_rate, 일별) |
| `getCollectLastRun()` | `{ collector_name, last_run, last_status }[]` | 수집기별 마지막 실행 이력 |
| `triggerUsaCollect()` | `{ started, reason? }` | admin 전용 — FRED + TIC 수집 트리거 |
| `getUsaCollectStatusAction()` | `CollectStatus` | FRED+TIC 수집 진행 상태 조회 |
| `triggerFxCollect()` | `{ started, reason? }` | admin 전용 — 환율 수집 트리거 |
| `getFxCollectStatusAction()` | `CollectStatus` | 환율 수집 진행 상태 조회 |

---

## DB 연결

동일 Supabase DB 사용 → `lib/pension-db.ts` Pool 재사용.

---

## 수집기 (`collector/usa/`)

| 수집기 | 파일 | 데이터 소스 | 스케줄 |
|--------|------|-------------|--------|
| FRED | `collectors/fred_collector.py` | FRED API (6개 지표) | 매주 월 09:00 KST |
| FX | `collectors/fxrate_collector.py` | Frankfurter API (api.frankfurter.dev) | 매일 09:00 KST |
| TIC | `collectors/tic_collector.py` | US Treasury slt_table5.txt + slt_table6.txt | 매주 월 09:00 KST |

- FRED 지표: PCEPI, PAYEMS, UNRATE, GS10, GS30, MORTGAGE30US, FEDFUNDS (NAPM 제거 — 시리즈 미존재)
- FEDFUNDS: indicator_code 유지, **series_id = DFEDTARU** (목표 상한) — `FOMC_DECISION_DATES` 목록 기준 발표일마다 저장 (금리 동결 포함, 연 8회)
- GS10: **series_id = DGS10** (일별) → EOP 월집계 후 `_to_month_end()` 적용 — stat_date = 월 말일, value = 월말 수익률
- GS30: **series_id = DGS30** (일별) → 동일
- PCEPI, PAYEMS, UNRATE, MORTGAGE30US: FRED 기본 월초 라벨(기준월 1일) 유지 — 기준월이 의미 있는 지표
- 환율: Frankfurter API 일별 USD/KRW, `t_fx_rate` 테이블에 증분 저장
- TIC: slt_table5.txt (최근 13개월, 십억달러) + slt_table6.txt (역대 이력, 백만달러) 병합, Table5 우선

### FRED 수집기 방식 상세

| 지표 | FRED 시리즈 | 수집 방식 | stat_date | 비고 |
|------|------------|----------|-----------|------|
| FEDFUNDS | DFEDTARU | FOMC 발표일 조회 | FOMC 결정일 (KST) | `FOMC_DECISION_DATES` 참조, 금리 동결 시에도 저장 |
| GS10 | DGS10 | EOP 월집계 + 월말 변환 | 월 말일 (예: 2025-04-30) | `_to_month_end()` 적용 |
| GS30 | DGS30 | EOP 월집계 + 월말 변환 | 월 말일 | 동일 |
| PCEPI | PCEPI | EOP 월집계 | 기준월 1일 (예: 2025-04-01) | FRED 월별 기본 라벨 |
| PAYEMS | PAYEMS | EOP 월집계 | 기준월 1일 | 동일 |
| UNRATE | UNRATE | EOP 월집계 | 기준월 1일 | 동일 |
| MORTGAGE30US | MORTGAGE30US | EOP 월집계 | 기준월 1일 | 동일 |

### FOMC_DECISION_DATES 관리

- 위치: `collector/usa/config/settings.py`
- 기준: Investing.com KST 표기 (FOMC 발표 14:00 ET = 익일 03~04시 KST)
- **매년 연초에 당해 연도 일정 추가 필요** (출처: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm)
- 긴급 회의(unscheduled) 발생 시 즉시 추가

## 알려진 제약

- FRED 월집계는 일별 시리즈도 1일 라벨 반환 → GS10/GS30은 `_to_month_end()`로 보정
- FEDFUNDS는 `FOMC_DECISION_DATES` 미갱신 시 당해 연도 데이터 누락 가능 — 매년 연초 업데이트 필요
- TIC 데이터는 약 2개월 지연 발표
- Frankfurter API는 영업일 기준 일별 데이터 (주말·공휴일 없음)
- t_fx_rate 환율이 없는 날짜(주말 등)는 LATERAL JOIN으로 가장 가까운 이전 영업일 환율 적용
