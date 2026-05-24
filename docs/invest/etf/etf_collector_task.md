# ETF 수집기 — 기술 사양

BlackRock iShares ETF 보유 종목 데이터를 자동/수동 수집하여 PostgreSQL에 저장.
기존 `stock_analysis/collector/` 에서 `pensions/collector/etf/` 로 이전.

---

## 아키텍처

```
fetch_holdings.py
├── parser.py  (Playwright)
│   └── iShares 제품 페이지 방문 → 쿠키 동의 → "Detailed Holdings and Analytics" 클릭 → CSV 다운로드
└── db.py (psycopg2)
    ├── etf_holdings  UPSERT
    └── etf_fetch_log 수집 로그
```

BlackRock `.ajax?fileType=csv` 직접 URL은 HTML 반환(봇 차단) → Playwright 브라우저 자동화 필수.

---

## 파일 구조 (이전 후)

```
collector/etf/
├── fetch_holdings.py    메인 스크립트 (EntryPoint)
├── parser.py            Playwright CSV 다운로더 + 파서
├── db.py                DB 연결·UPSERT·수집 로그
└── requirements.txt     psycopg2-binary, playwright, python-dotenv, pandas
```

---

## 수집 대상 ETF

| ETF | 이름 | iShares 제품 페이지 |
|-----|------|---------------------|
| IEMG | iShares Core MSCI Emerging Markets | /products/244050/ |
| EEM  | iShares MSCI Emerging Markets | /products/239637/ |
| EWY  | iShares MSCI South Korea Capped | /products/239681/ |

---

## DB 환경변수 (`config/.env` 재사용)

```
PENSION_SIM_DB_HOST
PENSION_SIM_DB_PORT
PENSION_SIM_DB_NAME
PENSION_SIM_DB_USER
PENSION_SIM_DB_PASSWORD
```

기존 `stock_analysis/config/.env`에서 `DB_HOST`, `DB_USER` 등 키 이름이 다름.
이전 시 usa 수집기(`config/settings.py`)와 동일한 키 이름으로 변경.

---

## 주요 로직

### parser.py — Playwright 싱글턴

```python
_get_context()   # 최초 1회 IEMG 제품 페이지 방문 + 쿠키 Accept
download_csv(etf_ticker)  # 제품 페이지 이동 → 버튼 클릭 → 다운로드 캡처
parse_csv(raw, etf_ticker)  # CSV bytes → (holding_date, records[])
                             # HTML 응답이면 봇차단 감지 후 예외 발생
```

### db.py — UPSERT + 로그

```python
upsert_holdings(records)   # execute_batch, page_size=500
log_fetch(...)             # ON CONFLICT: success 기록은 skipped로 덮어쓰지 않음
holding_date_exists(etf, date)  # etf_fetch_log status='success' 확인
```

---

## 실행 방법

```bash
cd collector/etf
python fetch_holdings.py               # 전체 ETF 수집
python fetch_holdings.py --etf EWY     # 특정 ETF만
python fetch_holdings.py --dry-run     # DB 저장 없이 파싱 결과 확인
```

---

## 수집 로그 상태값

| status | 의미 |
|--------|------|
| `success` | 신규 날짜 저장 완료 |
| `skipped` | 이미 저장된 날짜 (fetched_at 갱신, error_msg에 사유) |
| `error` | 다운로드/파싱 실패 |

---

## 이전 작업 체크리스트

- [ ] `collector/etf/` 폴더 생성
- [ ] `fetch_holdings.py` 복사 → `.env` 경로를 `config/.env` 로 수정
- [ ] `parser.py` 복사 (변경 없음)
- [ ] `db.py` 복사 → 환경변수 키를 `PENSION_SIM_DB_*` 로 변경
- [ ] `requirements.txt` 복사
- [ ] `pip install -r requirements.txt && playwright install chromium`
- [ ] `create_etf_tables.sql` 로 DB 테이블 생성 확인
- [ ] `python fetch_holdings.py --dry-run` 동작 확인
