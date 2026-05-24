# 미국 경제지표 수집기 — 기술 사양

> 구현 완료: `pensions/collector/usa/`

---

## 아키텍처

```
main.py
├── collectors/fred_collector.py    FRED API (6개 시리즈)
├── collectors/fxrate_collector.py  Frankfurter API USD/KRW → t_fx_rate
└── collectors/tic_collector.py     US Treasury TIC (일본·중국 국채 보유)

config/
├── settings.py     config/.env 로드, 환경변수 접근
└── database.py     psycopg2 Pool 싱글턴

repositories/
├── indicator_repository.py    indicator_data UPSERT
├── exchange_repository.py     t_fx_rate 조회 (get_rate만 제공)
└── treasury_repository.py     treasury_holding UPSERT

utils/
├── date_util.py   날짜 계산 유틸
├── logger.py      로깅
└── retry.py       tenacity 재시도 데코레이터
```

---

## 수집 소스별 상세

### FRED (6개 시리즈)

| Series ID | 지표 | 단위 |
|-----------|------|------|
| PCEPI | PCE 물가지수 | Index |
| PAYEMS | 비농업고용(NFP) | 천명 |
| UNRATE | 실업률 | % |
| GS10 | 10년물 국채금리 | % |
| MORTGAGE30US | 30년 모기지금리 | % |
| FEDFUNDS | 기준금리 | % |

- API: `https://api.stlouisfed.org/fred/series/observations`
- 인증: `FRED_API_KEY` (config/.env)
- 증분 수집: `indicator_data` 최신 stat_date 이후만 요청

### 환율 (Frankfurter API)

- API: `https://api.frankfurter.dev/v1/{start}..{end}?from=USD&to=KRW`
- 인증: 없음 (무료 공개 API)
- 대상: USD/KRW 일별 영업일 기준
- 저장 테이블: `t_fx_rate` (e_date VARCHAR YYYYMMDD, fx_rate NUMERIC)
- 증분 수집: `t_fx_rate` 최신 e_date 다음날부터 오늘까지 조회

### TIC (US Treasury)

- URL:
  - `https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/slt_table5.txt` (최근 13개월, 십억달러)
  - `https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/slt_table6.txt` (역대 이력, 백만달러)
- 파싱: Table5 TSV(YYYY-MM 헤더) + Table6 TSV(행별 국가/날짜/금액) 병합, 중복 시 Table5 우선
- KRW 환산: `t_fx_rate` 기준 해당 날짜 이전 가장 최근 환율 적용 (`exchange_repository.get_rate()`)
- 저장 테이블: `treasury_holding` (country_code, stat_date, amount_usd_billion, exchange_rate, amount_krw_trillion)

---

## 실행 방법

```bash
cd collector/usa
python main.py              # 전체 증분 수집 (FRED + FX + TIC)
python main.py --full       # 전체 재적재 (최초 실행)
python main.py --only fred  # FRED만 수집
python main.py --only fx    # 환율만 수집
python main.py --only tic   # TIC만 수집
python main.py --only fred tic  # FRED + TIC (FX 제외)
```

---

## 설정 (`config/.env`)

```
FRED_API_KEY=...
PENSION_SIM_DB_HOST=...
PENSION_SIM_DB_PORT=5432
PENSION_SIM_DB_NAME=postgres
PENSION_SIM_DB_USER=...
PENSION_SIM_DB_PASSWORD=...
```

---

## 수집 로그 (`usa_collect_log`)

| 컬럼 | 내용 |
|------|------|
| collector_name | fred / fxrate / tic |
| target_name | 지표코드(PCEPI 등) 또는 국가코드(JPN/CHN) |
| status | success / error / skipped |
| row_count | 저장된 행 수 |
| message | 오류 메시지 또는 비고 |

---

## 알려진 제약

- TIC 데이터는 약 2개월 지연 발표
- FRED 일부 시리즈는 분기·연간 발표 (월별 쿼리 시 누락 가능)
- Frankfurter API는 영업일 기준 일별 데이터 (주말·공휴일 없음), 과거 이력 제공
