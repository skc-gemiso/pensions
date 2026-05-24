from datetime import date
from config.database import get_conn, put_conn


def get_rate(stat_date: date) -> float | None:
    """t_fx_rate 기준 가장 가까운 이전 환율 반환 (e_date <= stat_date)"""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT fx_rate FROM t_fx_rate
                   WHERE e_date <= %s
                   ORDER BY e_date DESC LIMIT 1""",
                (stat_date.strftime("%Y%m%d"),),
            )
            row = cur.fetchone()
            return float(row[0]) if row else None
    finally:
        put_conn(conn)
