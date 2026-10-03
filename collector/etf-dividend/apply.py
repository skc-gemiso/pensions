"""
공시 기준으로 t_etf_dividend 를 맞춘다.

수동 입력 행과 공시 행은 **주당분배금이 매월 일치하고 지급기준일만 3~5일 차이**가 난다.
그래서 `(종목코드, 연월, 주당분배금)` 으로 짝을 찾는다 — 같은 달에 같은 금액이 두 번
나오는 일은 없어 이 키로 충분하다.

| | 지급기준일 | 주당분배금 |
|---|---|---|
| DB | 2026-09-10 | 300 |
| 공시 | 2026-09-15 | 300 |

세 가지 처리:
  migrate — 짝이 있고 기준일/분배율/과세표준이 다르면 공시값으로 UPDATE (기준일 PK 포함)
  insert  — 그 달에 DB 행이 없으면 INSERT
  keep    — 공시에서 못 찾은 DB 행은 **건드리지 않고** 알린다

기준일을 바꾸면 계좌 입금 행의 비고 키(`분배금: {코드} ({기준일})`)도 바뀐다.
옛 키 행을 지우는 것까지만 하고, 새 입금 행 생성은 /api/cron/stock-sync 가 매일 맡는다
(입금 계산을 Python 에 복제하지 않는다 — lib/dividend-deposits.ts 한 곳에만 둔다).
"""
from datetime import date


def month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def plan(existing: dict, published: dict) -> dict:
    """적용할 작업 목록을 만든다. DB 를 건드리지 않는다."""
    # 공시를 (종목, 연월, 주당분배금) 으로 색인
    pub_idx = {}
    for r in published.values():
        if r["dist_amt"] is None:
            continue
        pub_idx[(r["stock_code"], month_key(r["ref_date"]), int(r["dist_amt"]))] = r

    migrate, insert, keep = [], [], []
    matched_pub = set()

    for (code, ref), d in existing.items():
        amt = int(d["dist_amt"]) if d["dist_amt"] is not None else None
        p = pub_idx.get((code, month_key(ref), amt)) if amt is not None else None
        if not p:
            keep.append(d)
            continue
        matched_pub.add((p["stock_code"], p["ref_date"]))
        changes = {}
        if p["ref_date"] != ref:
            changes["ref_date"] = p["ref_date"]
        if p["pay_date"] and p["pay_date"] != d["pay_date"]:
            changes["pay_date"] = p["pay_date"]
        if p["dist_rate"] is not None and float(d["dist_rate"] or 0) != round(p["dist_rate"], 2):
            changes["dist_rate"] = p["dist_rate"]
        if p["tax_base_amt"] is not None and float(d["tax_base_amt"] or 0) != p["tax_base_amt"]:
            changes["tax_base_amt"] = p["tax_base_amt"]
        if changes:
            migrate.append({"old": d, "new": p, "changes": changes})

    for key, p in published.items():
        if key not in matched_pub and key not in existing:
            # 그 달에 DB 행이 아예 없는 공시만 신규로 넣는다
            same_month = any(c == p["stock_code"] and month_key(r) == month_key(p["ref_date"])
                             for c, r in existing)
            if not same_month:
                insert.append(p)

    return {"migrate": migrate, "insert": insert, "keep": keep}


def apply(conn, actions: dict, log=print) -> dict:
    """plan() 결과를 DB 에 반영한다. 한 트랜잭션으로 묶는다."""
    n_mig = n_ins = n_memo = 0
    with conn:
        with conn.cursor() as cur:
            for m in actions["migrate"]:
                old, new = m["old"], m["new"]
                cur.execute(
                    """
                    UPDATE t_etf_dividend
                       SET ref_date = %s, pay_date = %s, dist_rate = %s,
                           dist_amt = %s, tax_base_amt = %s, updated_at = NOW()
                     WHERE stock_code = %s AND ref_date = %s
                    """,
                    (new["ref_date"], new["pay_date"], new["dist_rate"],
                     new["dist_amt"], new["tax_base_amt"],
                     old["stock_code"], old["ref_date"]),
                )
                n_mig += cur.rowcount
                if "ref_date" in m["changes"]:
                    # 기준일이 바뀌면 옛 비고 키로 만든 계좌 입금 행은 고아가 된다
                    cur.execute(
                        "DELETE FROM my_account_info WHERE memo = %s",
                        (f"분배금: {old['stock_code']} ({old['ref_date']})",),
                    )
                    n_memo += cur.rowcount

            for p in actions["insert"]:
                cur.execute(
                    """
                    INSERT INTO t_etf_dividend
                        (stock_code, ref_date, pay_date, dist_rate, dist_amt, tax_base_amt)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (stock_code, ref_date) DO NOTHING
                    """,
                    (p["stock_code"], p["ref_date"], p["pay_date"],
                     p["dist_rate"], p["dist_amt"], p["tax_base_amt"]),
                )
                n_ins += cur.rowcount

    log(f"  수정 {n_mig}건 · 신규 {n_ins}건 · 옛 키 입금행 삭제 {n_memo}건")
    return {"migrated": n_mig, "inserted": n_ins, "deposits_removed": n_memo}
