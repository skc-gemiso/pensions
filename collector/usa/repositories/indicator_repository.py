from datetime import date
from config.database import get_conn, put_conn


def get_max_date(indicator_code: str) -> date | None:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT MAX(stat_date) FROM indicator_data WHERE indicator_code = %s",
                (indicator_code,),
            )
            row = cur.fetchone()
            return row[0] if row and row[0] else None
    finally:
        put_conn(conn)


def upsert_master_many(rows: list[dict]) -> None:
    """FRED_SERIES → indicator_master 동기화 (신규 추가 + 이름 갱신)
    rows: [{indicator_code, indicator_name, unit, source_name, fred_series_id}]
    """
    if not rows:
        return
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO indicator_master
                    (indicator_code, indicator_name, unit, source_name, fred_series_id)
                VALUES (%(indicator_code)s, %(indicator_name)s, %(unit)s, %(source_name)s, %(fred_series_id)s)
                ON CONFLICT (indicator_code) DO UPDATE SET
                    indicator_name = EXCLUDED.indicator_name,
                    unit           = EXCLUDED.unit
                """,
                rows,
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        put_conn(conn)


def upsert_many(rows: list[dict]) -> int:
    """rows: [{indicator_code, stat_date, value}, ...]"""
    if not rows:
        return 0
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO indicator_data (indicator_code, stat_date, value)
                VALUES (%(indicator_code)s, %(stat_date)s, %(value)s)
                ON CONFLICT (indicator_code, stat_date)
                DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
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
