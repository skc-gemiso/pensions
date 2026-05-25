"""
미국 경제 지표 수집기

사용법:
  python main.py                      # 전체 수집 (기본: FRED + FX + TIC)
  python main.py --full               # 전체 재적재 (최초 실행 시)
  python main.py --only fred          # FRED만 수집
  python main.py --only fx            # 환율만 수집
  python main.py --only tic           # TIC(국채)만 수집
  python main.py --only fred tic      # FRED + TIC (FX 제외)
"""
import argparse
from datetime import datetime, date
from utils.logger import logger
from config.database import get_conn, put_conn


def _query_max_date(sql: str, params: tuple = ()) -> date | None:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            return row[0] if row and row[0] else None
    finally:
        put_conn(conn)


def log_collect(collector_name: str, target_name: str, started_at: datetime,
                status: str, row_count: int | None, message: str | None = None,
                stat_date: date | None = None):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO usa_collect_log
                    (collector_name, target_name, started_at, finished_at, status, row_count, message, stat_date)
                VALUES (%s, %s, %s, NOW(), %s, %s, %s, %s)
                """,
                (collector_name, target_name, started_at, status, row_count, message, stat_date),
            )
        conn.commit()
    except Exception as e:
        logger.warning(f"usa_collect_log 저장 실패: {e}")
    finally:
        put_conn(conn)


def run_fred(incremental: bool):
    from collectors import fred_collector
    started = datetime.now()
    logger.info("=== FRED 수집 시작 ===")
    results = fred_collector.collect(incremental=incremental)
    for code, cnt in results.items():
        status = "error" if cnt < 0 else "success"
        stat_date = _query_max_date(
            "SELECT MAX(stat_date) FROM indicator_data WHERE indicator_code = %s", (code,)
        ) if cnt > 0 else None
        log_collect("fred", code, started, status, cnt if cnt >= 0 else None,
                    None if cnt >= 0 else "수집 실패", stat_date)
    logger.info(f"=== FRED 완료: {results} ===")


def run_fx(incremental: bool):
    from collectors import fxrate_collector
    started = datetime.now()
    logger.info("=== 환율 수집 시작 ===")
    try:
        cnt = fxrate_collector.collect(incremental=incremental)
        stat_date = _query_max_date(
            "SELECT MAX(TO_DATE(e_date, 'YYYYMMDD')) FROM t_fx_rate"
        ) if cnt and cnt > 0 else None
        log_collect("fxrate", "USD/KRW", started, "success", cnt, stat_date=stat_date)
    except Exception as e:
        logger.error(f"환율 수집 실패: {e}")
        log_collect("fxrate", "USD/KRW", started, "error", None, str(e))
    logger.info("=== 환율 완료 ===")


def run_tic(incremental: bool):
    from collectors import tic_collector
    started = datetime.now()
    logger.info("=== TIC 수집 시작 ===")
    results = tic_collector.collect(incremental=incremental)
    for code, cnt in results.items():
        status = "error" if cnt < 0 else "success"
        stat_date = _query_max_date(
            "SELECT MAX(stat_date) FROM treasury_holding WHERE country_code = %s", (code,)
        ) if cnt > 0 else None
        log_collect("tic", code, started, status, cnt if cnt >= 0 else None,
                    None if cnt >= 0 else "수집 실패", stat_date)
    logger.info(f"=== TIC 완료: {results} ===")


def main():
    parser = argparse.ArgumentParser(description="미국 경제 지표 수집기")
    parser.add_argument("--full",  action="store_true", help="전체 재적재 (최초 실행)")
    parser.add_argument("--only", choices=["fred", "fx", "tic"], nargs="+",
                        help="실행할 수집기 (복수 지정 가능)")
    args = parser.parse_args()

    incremental = not args.full
    only = set(args.only) if args.only else {"fred", "fx", "tic"}

    if "fred" in only:
        run_fred(incremental)
    if "fx" in only:
        run_fx(incremental)
    if "tic" in only:
        run_tic(incremental)

    logger.info("모든 수집 완료")


if __name__ == "__main__":
    main()
