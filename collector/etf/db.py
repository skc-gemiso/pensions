"""DB 연결, 테이블 생성, UPSERT, 수집 로그 모듈"""
import os
from pathlib import Path
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / "config" / ".env")

_DSN = dict(
    host=os.getenv("PENSION_SIM_DB_HOST"),
    port=int(os.getenv("PENSION_SIM_DB_PORT") or 5432),
    dbname=os.getenv("PENSION_SIM_DB_NAME"),
    user=os.getenv("PENSION_SIM_DB_USER"),
    password=os.getenv("PENSION_SIM_DB_PASSWORD"),
    sslmode="require",
    connect_timeout=15,
)

_UPSERT_SQL = """
INSERT INTO etf_holdings (
    etf_ticker, holding_date, ticker, name, sector, asset_class,
    market_value, weight_pct, notional_value, shares, price,
    location, exchange, currency, fx_rate, market_currency
) VALUES (
    %(etf_ticker)s, %(holding_date)s, %(ticker)s, %(name)s, %(sector)s, %(asset_class)s,
    %(market_value)s, %(weight_pct)s, %(notional_value)s, %(shares)s, %(price)s,
    %(location)s, %(exchange)s, %(currency)s, %(fx_rate)s, %(market_currency)s
)
ON CONFLICT (etf_ticker, holding_date, ticker) DO UPDATE SET
    name            = EXCLUDED.name,
    sector          = EXCLUDED.sector,
    asset_class     = EXCLUDED.asset_class,
    market_value    = EXCLUDED.market_value,
    weight_pct      = EXCLUDED.weight_pct,
    notional_value  = EXCLUDED.notional_value,
    shares          = EXCLUDED.shares,
    price           = EXCLUDED.price,
    location        = EXCLUDED.location,
    exchange        = EXCLUDED.exchange,
    currency        = EXCLUDED.currency,
    fx_rate         = EXCLUDED.fx_rate,
    market_currency = EXCLUDED.market_currency
"""


def get_connection():
    return psycopg2.connect(**_DSN)


def holding_date_exists(etf_ticker: str, holding_date) -> bool:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM etf_fetch_log WHERE etf_ticker=%s AND holding_date=%s AND status='success'",
                (etf_ticker, holding_date),
            )
            return cur.fetchone() is not None


def upsert_holdings(records: list) -> int:
    if not records:
        return 0
    with get_connection() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(cur, _UPSERT_SQL, records, page_size=500)
        conn.commit()
    return len(records)


def log_fetch(etf_ticker: str, holding_date, status: str, row_count: int = None, error_msg: str = None):
    sql = """
    INSERT INTO etf_fetch_log (etf_ticker, holding_date, status, row_count, error_msg)
    VALUES (%s, %s, %s, %s, %s)
    ON CONFLICT (etf_ticker, holding_date) DO UPDATE SET
        fetched_at = NOW(),
        status    = CASE
                      WHEN etf_fetch_log.status = 'success' AND EXCLUDED.status = 'skipped'
                      THEN etf_fetch_log.status
                      ELSE EXCLUDED.status
                    END,
        row_count = CASE
                      WHEN etf_fetch_log.status = 'success' AND EXCLUDED.status = 'skipped'
                      THEN etf_fetch_log.row_count
                      ELSE EXCLUDED.row_count
                    END,
        error_msg  = EXCLUDED.error_msg
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (etf_ticker, holding_date, status, row_count, error_msg))
        conn.commit()
