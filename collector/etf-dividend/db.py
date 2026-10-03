"""ETF 분배금 수집기 DB 접근."""
import os
from datetime import date
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / "config" / ".env")

_DSN = dict(
    host=os.environ["PENSION_SIM_DB_HOST"],
    port=int(os.environ.get("PENSION_SIM_DB_PORT") or 5432),
    dbname=os.environ["PENSION_SIM_DB_NAME"],
    user=os.environ["PENSION_SIM_DB_USER"],
    password=os.environ["PENSION_SIM_DB_PASSWORD"],
)

# 종목명 앞단의 브랜드로 운용사를 가른다. 운용사별 공시 페이지가 달라 이 매핑이 수집 경로를 정한다
BRAND_TO_HOUSE = {
    "TIGER":  "mirae",
    "RISE":   "kb",
    "KBSTAR": "kb",
    "KODEX":  "samsung",
}

HOUSE_LABEL = {"mirae": "미래에셋", "kb": "KB", "samsung": "삼성"}


def connect():
    return psycopg2.connect(**_DSN)


def house_of(stock_name: str) -> str | None:
    """종목명 → 운용사 코드. 알 수 없으면 None."""
    head = (stock_name or "").strip().split(" ")[0].upper()
    return BRAND_TO_HOUSE.get(head)


def fetch_target_etfs(conn) -> list[dict]:
    """t_stock_list 의 ETF 전체. 운용사를 못 가리는 종목도 그대로 돌려주고 호출부에서 알린다."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT stock_code, COALESCE(stock_short_name, stock_name)
            FROM t_stock_list
            WHERE security_type ILIKE '%%ETF%%'
            ORDER BY stock_code
            """
        )
        rows = cur.fetchall()
    return [{"stock_code": c, "stock_name": n, "house": house_of(n)} for c, n in rows]


def fetch_existing(conn, stock_codes: list[str]) -> dict[tuple[str, date], dict]:
    """이미 등록된 분배금. 키 (stock_code, ref_date) — t_etf_dividend PK 와 같다."""
    if not stock_codes:
        return {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT stock_code, ref_date, pay_date, dist_rate, dist_amt, tax_base_amt
            FROM t_etf_dividend
            WHERE stock_code = ANY(%s)
            ORDER BY stock_code, ref_date
            """,
            (stock_codes,),
        )
        rows = cur.fetchall()
    return {
        (r[0], r[1]): {
            "stock_code": r[0], "ref_date": r[1], "pay_date": r[2],
            "dist_rate": r[3], "dist_amt": r[4], "tax_base_amt": r[5],
        }
        for r in rows
    }
