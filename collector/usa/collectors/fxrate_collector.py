"""
USD/KRW 환율 수집 — Frankfurter API (https://api.frankfurter.dev)
t_fx_rate 테이블에 업서트 (e_date VARCHAR YYYYMMDD, fx_rate NUMERIC)
"""
from datetime import date, timedelta
import requests
from utils.logger import logger
from utils.retry import http_retry

_BASE_URL = "https://api.frankfurter.dev/v1"


@http_retry
def _get(url: str) -> dict:
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _get_max_date() -> date | None:
    from config.database import get_conn, put_conn
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT MAX(e_date) FROM t_fx_rate")
            row = cur.fetchone()
            if row and row[0]:
                s = str(row[0])
                return date(int(s[:4]), int(s[4:6]), int(s[6:8]))
            return None
    finally:
        put_conn(conn)


def _upsert(rows: list[dict]) -> int:
    if not rows:
        return 0
    from config.database import get_conn, put_conn
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO t_fx_rate (e_date, fx_rate)
                VALUES (%(e_date)s, %(fx_rate)s)
                ON CONFLICT (e_date) DO UPDATE SET fx_rate = EXCLUDED.fx_rate
                """,
                rows,
            )
        conn.commit()
        return len(rows)
    except Exception:
        conn.rollback()
        raise
    finally:
        put_conn(conn)


def collect(incremental: bool = True) -> int:
    today = date.today()

    if incremental:
        max_date = _get_max_date()
        start = (max_date + timedelta(days=1)) if max_date else date(2000, 1, 1)
    else:
        start = date(2000, 1, 1)

    if start > today:
        logger.info("[FX] 최신 데이터 이미 있음, 수집 생략")
        return 0

    end = today
    url = f"{_BASE_URL}/{start}..{end}?from=USD&to=KRW"
    logger.info(f"[FX] {start} ~ {end} 환율 조회 중...")

    try:
        data = _get(url)
    except Exception as e:
        logger.error(f"[FX] API 호출 실패: {e}")
        raise

    rates = data.get("rates", {})
    rows = [
        {"e_date": d.replace("-", ""), "fx_rate": v["KRW"]}
        for d, v in rates.items()
        if "KRW" in v
    ]

    saved = _upsert(rows)
    logger.info(f"[FX] {saved}건 저장 완료")
    return saved
