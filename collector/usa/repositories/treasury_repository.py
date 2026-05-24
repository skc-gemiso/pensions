from datetime import date
from config.database import get_conn, put_conn


def get_max_date(country_code: str) -> date | None:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT MAX(stat_date) FROM treasury_holding WHERE country_code = %s",
                (country_code,),
            )
            row = cur.fetchone()
            return row[0] if row and row[0] else None
    finally:
        put_conn(conn)


def upsert_many(rows: list[dict]) -> int:
    """rows: [{country_code, country_name, stat_date, amount_usd_billion, exchange_rate, amount_krw_trillion}, ...]"""
    if not rows:
        return 0
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO treasury_holding
                    (country_code, country_name, stat_date, amount_usd_billion, exchange_rate, amount_krw_trillion)
                VALUES
                    (%(country_code)s, %(country_name)s, %(stat_date)s,
                     %(amount_usd_billion)s, %(exchange_rate)s, %(amount_krw_trillion)s)
                ON CONFLICT (country_code, stat_date)
                DO UPDATE SET
                    amount_usd_billion  = EXCLUDED.amount_usd_billion,
                    exchange_rate       = EXCLUDED.exchange_rate,
                    amount_krw_trillion = EXCLUDED.amount_krw_trillion,
                    updated_at          = NOW()
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
