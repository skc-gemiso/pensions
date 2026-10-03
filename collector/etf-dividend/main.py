"""
ETF 분배금 수집기 — t_stock_list 의 ETF 를 운용사 공시와 맞춰본다.

사용법:
  python main.py                  # 대조 리포트 (DB 쓰기 없음) — 기본
  python main.py --months 3       # 최근 3개월 범위로 조회
  python main.py --show-browser   # 브라우저 띄워서 확인

지금은 **읽기 전용**이다. 기존 수동 입력 행과 운용사 공시의 지급기준일이 어긋나는 게
확인돼(498400 9월: DB 09-10 vs 공시 09-15), 어느 쪽을 정답으로 둘지 정하기 전에는
t_etf_dividend 에 쓰지 않는다. 저장 모드는 그 결정 뒤에 붙인다.
"""
import argparse
import io
import sys
from datetime import date, timedelta

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

import apply as applier
import db
import scrapers


def fmt(v, suffix="") -> str:
    if v is None:
        return "-"
    if isinstance(v, float) and v == int(v):
        v = int(v)
    return f"{v:,}{suffix}" if isinstance(v, int) else f"{v}{suffix}"


def main():
    ap = argparse.ArgumentParser(description="ETF 분배금 공시 대조 리포트")
    ap.add_argument("--samsung-tab", default="상장이후",
                    help="삼성 기간 탭 (1개월/3개월/6개월/1년/3년/상장이후, 기본 상장이후)")
    ap.add_argument("--show-browser", action="store_true", help="브라우저 표시")
    ap.add_argument("--apply", action="store_true",
                    help="기존 행을 공시 기준으로 수정한다 (기본은 리포트만)")
    ap.add_argument("--insert-months", type=int, default=0, metavar="N",
                    help="공시에만 있는 분배금을 최근 N개월 범위에서 INSERT 한다 (기본 0 = 넣지 않음). "
                         "일일 수집은 2 정도. 상장 이후 전체를 넣으려면 --insert-all")
    ap.add_argument("--insert-all", action="store_true",
                    help="기간 제한 없이 공시 전체를 INSERT 한다. 069500 처럼 오래된 ETF 는 "
                         "2003년부터 수십 건이 한꺼번에 쌓인다")
    args = ap.parse_args()

    conn = db.connect()
    try:
        targets = db.fetch_target_etfs(conn)
        codes = [t["stock_code"] for t in targets]
        existing = db.fetch_existing(conn, codes)
    finally:
        conn.close()

    print("=" * 94)
    print(f"  ETF 분배금 공시 대조 리포트   [{date.today()}]   삼성 기간: {args.samsung_tab}")
    print("=" * 94)

    print(f"\n■ 수집 대상 — t_stock_list ETF {len(targets)}종")
    for t in targets:
        label = db.HOUSE_LABEL.get(t["house"], "??? 운용사 판별 실패")
        print(f"   {t['stock_code']:<8} {t['stock_name']:<42} {label}")
    unknown = [t for t in targets if not t["house"]]
    if unknown:
        print(f"   ! 운용사를 못 가린 종목 {len(unknown)}개 — 브랜드 매핑(db.BRAND_TO_HOUSE)에 추가 필요")

    houses = {t["house"] for t in targets if t["house"]}
    print("\n■ 공시 수집")
    scraped: list[dict] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not args.show_browser)
        try:
            if "mirae" in houses:
                # 미래에셋 엑셀에는 종목코드 열이 없어 종목명으로 맞춘다
                name_to_code = {t["stock_name"]: t["stock_code"] for t in targets if t["house"] == "mirae"}
                scraped += scrapers.scrape_mirae(browser, name_to_code)
            if "samsung" in houses:
                scraped += scrapers.scrape_samsung(browser, tab=args.samsung_tab)
            if "kb" in houses:
                scraped += scrapers.scrape_kb(browser)
        finally:
            browser.close()

    # 우리 종목만 남긴다 (운용사 페이지는 전 종목을 다 준다)
    mine = {}
    for r in scraped:
        if r["stock_code"] in codes and r["ref_date"]:
            mine[(r["stock_code"], r["ref_date"])] = r
    print(f"\n  공시에서 받은 행 {len(scraped)}개 → 우리 종목 {len(mine)}건")

    # ── 대조 ──
    print("\n" + "=" * 94)
    print("  대조 결과")
    print("=" * 94)

    keys = sorted(set(existing) | set(mine), key=lambda k: (k[0], k[1]), reverse=True)
    name_of = {t["stock_code"]: t["stock_name"] for t in targets}
    diff_n = only_db = only_pub = same = 0

    for key in keys:
        code, ref = key
        d, p = existing.get(key), mine.get(key)
        if d and p:
            fields = [
                ("실지급일",   d["pay_date"], p["pay_date"]),
                ("분배율",     float(d["dist_rate"]) if d["dist_rate"] is not None else None, p["dist_rate"]),
                ("주당분배금", float(d["dist_amt"]) if d["dist_amt"] is not None else None, p["dist_amt"]),
            ]
            gaps = [(n, a, b) for n, a, b in fields if b is not None and a != b]
            if not gaps:
                same += 1
                continue
            diff_n += 1
            print(f"\n[값 다름] {code} {name_of.get(code,'')} · 기준일 {ref}")
            for n, a, b in gaps:
                print(f"    {n:<10} DB {fmt(a):<14} 공시 {fmt(b)}")
        elif d:
            only_db += 1
            print(f"\n[DB 만 있음] {code} {name_of.get(code,'')} · 기준일 {ref}  "
                  f"분배율 {fmt(float(d['dist_rate']) if d['dist_rate'] is not None else None)} "
                  f"주당 {fmt(float(d['dist_amt']) if d['dist_amt'] is not None else None)}원")
        else:
            only_pub += 1
            print(f"\n[공시만 있음 → 신규] {code} {name_of.get(code,'')} · 기준일 {ref} "
                  f"지급 {p['pay_date']} 분배율 {fmt(p['dist_rate'])}% "
                  f"주당 {fmt(p['dist_amt'])}원 과세표준 {fmt(p['tax_base_amt'])}원")

    print("\n" + "-" * 94)
    print(f"  일치 {same}건 · 값 다름 {diff_n}건 · DB만 {only_db}건 · 공시만(신규) {only_pub}건")
    print("-" * 94)
    print("  ※ 'DB만 있음' 은 공시 조회 범위를 벗어난 과거일 수 있습니다 (미래에셋은 과거 소급 불가).")

    # ── 공시 기준 적용 ──
    actions = applier.plan(existing, mine)
    print("\n" + "=" * 94)
    print("  공시 기준 적용 계획" + ("  [실제 반영]" if args.apply else "  [미리보기 — DB 변경 없음]"))
    print("=" * 94)

    for m in actions["migrate"]:
        old, ch = m["old"], m["changes"]
        print(f"\n[수정] {old['stock_code']} {old['ref_date']}")
        for k, v in ch.items():
            print(f"    {k:<13} {str(old.get(k)):<14} → {v}")
    # 공시에만 있는 행은 상장 이후 전체가 잡힌다 (069500 은 2003년부터 67건).
    # 일일 수집에서 과거를 통째로 쌓지 않도록 기간으로 자른다.
    if actions["insert"] and not args.insert_all:
        cutoff = date.today() - timedelta(days=31 * max(args.insert_months, 0))
        dropped = [p for p in actions["insert"] if p["ref_date"] < cutoff]
        actions["insert"] = [p for p in actions["insert"] if p["ref_date"] >= cutoff]
        if dropped:
            by_code: dict[str, int] = {}
            for p in dropped:
                by_code[p["stock_code"]] = by_code.get(p["stock_code"], 0) + 1
            win = f"최근 {args.insert_months}개월" if args.insert_months else "기간 제한(기본 0개월)"
            print(f"\n[보류] {win} 밖의 공시 {len(dropped)}건 — {by_code}")
            print("       넣으려면 --insert-months N 을 늘리거나 --insert-all 을 쓰세요")

    for p in actions["insert"]:
        print(f"\n[신규] {p['stock_code']} {p['ref_date']} 지급 {p['pay_date']} "
              f"분배율 {p['dist_rate']} 주당 {p['dist_amt']}원 과세표준 {p['tax_base_amt']}")
    for d in actions["keep"]:
        print(f"\n[유지] {d['stock_code']} {d['ref_date']} — 공시에서 짝을 못 찾아 건드리지 않습니다")

    print("\n" + "-" * 94)
    print(f"  수정 {len(actions['migrate'])}건 · 신규 {len(actions['insert'])}건 · 유지 {len(actions['keep'])}건")
    print("-" * 94)

    if args.apply:
        conn2 = db.connect()
        try:
            applier.apply(conn2, actions)
        finally:
            conn2.close()
        print("\n  반영 완료. 계좌 입금 행은 /api/cron/stock-sync 가 매일 다시 만듭니다")
        print("  (지금 바로 맞추려면 분배금 팝업의 [계좌 입금 내역 재생성] 을 누르세요)")
    else:
        print("\n  ※ DB 에 쓰지 않았습니다. 반영하려면 --apply 를 붙이세요.")


if __name__ == "__main__":
    main()
