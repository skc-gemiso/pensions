"""
BlackRock ETF 보유 종목 수집 스크립트

실행 예시:
  python fetch_holdings.py               # 전체 ETF 수집
  python fetch_holdings.py --etf EWY     # 특정 ETF만
  python fetch_holdings.py --dry-run     # DB 저장 없이 확인
"""
import argparse
import sys
import time
from datetime import date
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / "config" / ".env")

import db
import parser as p

ETF_LIST = ["IEMG", "EEM", "EWY"]
REQUEST_DELAY = 0.5


def run_daily(etf_list: list[str] | None = None, dry_run: bool = False):
    if etf_list is None:
        etf_list = ETF_LIST
    today = date.today()
    print(f"\n{'='*60}")
    print(f"  ETF 데이터 수집  [{today}]")
    print(f"  대상 ETF : {', '.join(etf_list)}")
    print(f"{'='*60}\n")

    total_ok = total_skip = total_fail = 0

    for etf in etf_list:
        try:
            raw = p.download_csv(etf)
            time.sleep(REQUEST_DELAY)
            holding_date, records = p.parse_csv(raw, etf)

            if holding_date is None:
                print(f"  [{etf}] FAIL: 데이터 없음")
                if not dry_run:
                    db.log_fetch(etf, today, "error", row_count=0,
                                 error_msg="CSV 다운로드/파싱 실패 (봇 탐지 또는 페이지 변경)")
                total_fail += 1
                continue

            if not dry_run and db.holding_date_exists(etf, holding_date):
                print(f"  [{etf}] SKIP: {holding_date} 이미 저장됨")
                db.log_fetch(etf, holding_date, "skipped", row_count=0,
                             error_msg=f"이미 저장된 날짜: {holding_date}")
                total_skip += 1
                continue

            if dry_run:
                print(f"  [{etf}] DRY: {holding_date}  {len(records)}건")
                total_ok += 1
                continue

            saved = db.upsert_holdings(records)
            db.log_fetch(etf, holding_date, "success", row_count=saved)
            print(f"  [{etf}] OK: {holding_date}  {saved}건 저장")
            total_ok += 1

        except Exception as e:
            print(f"  [{etf}] FAIL: {e}")
            if not dry_run:
                db.log_fetch(etf, today, "error", row_count=0, error_msg=str(e))
            total_fail += 1

    print(f"\n{'='*60}")
    print(f"  완료: OK={total_ok}  SKIP={total_skip}  FAIL={total_fail}")
    print(f"{'='*60}\n")
    return total_fail == 0


def main():
    parser = argparse.ArgumentParser(description="BlackRock ETF 보유 종목 수집기")
    parser.add_argument("--etf", nargs="+", choices=ETF_LIST,
                        help="수집할 ETF (기본: 전체)")
    parser.add_argument("--dry-run", action="store_true",
                        help="DB 저장 없이 파싱 결과만 출력")
    args = parser.parse_args()

    etf_list = [e.upper() for e in args.etf] if args.etf else ETF_LIST
    sys.exit(0 if run_daily(etf_list, dry_run=args.dry_run) else 1)


if __name__ == "__main__":
    try:
        main()
    finally:
        p.close_browser()
