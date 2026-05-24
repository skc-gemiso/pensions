"""
미국 재무부 TIC 데이터 수집 — 두 소스 결합.

Table 5 (rolling 13개월, 십억달러):
  https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/slt_table5.txt

Table 6 (이력, 백만달러, ~2023-12):
  https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/slt_table6.txt
"""
import calendar
from datetime import date
import requests
from utils.logger import logger
from utils.retry import http_retry
from config.settings import TIC_COUNTRIES, INITIAL_LOAD_START
from repositories import treasury_repository, exchange_repository

_TABLE5_URL = "https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/slt_table5.txt"
_TABLE6_URL = "https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/slt_table6.txt"

COUNTRY_NAME_MAP = {
    "Japan":           "JPN",
    "China, Mainland": "CHN",
}


@http_retry
def _get(url: str) -> str:
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.text


def _month_end(ym: str) -> date:
    """'YYYY-MM' → 월말 date"""
    y, m = int(ym[:4]), int(ym[5:7])
    return date(y, m, calendar.monthrange(y, m)[1])


def _parse_table5(raw: str) -> dict[str, list[dict]]:
    """TSV: Country\t2026-03\t... → {code: [{stat_date, amount_usd_billion}]}"""
    result: dict[str, list[dict]] = {c["code"]: [] for c in TIC_COUNTRIES}
    lines = raw.splitlines()

    header_parts, dates = [], []
    for line in lines:
        parts = line.split("\t")
        if parts[0].strip() == "Country" and len(parts) > 2:
            header_parts = parts
            dates = [_month_end(p.strip()) for p in parts[1:]
                     if p.strip() and len(p.strip()) == 7]
            break

    if not dates:
        raise ValueError("Table 5: 날짜 헤더 없음")

    for line in lines:
        parts = [p.strip() for p in line.split("\t")]
        name = parts[0]
        if name not in COUNTRY_NAME_MAP:
            continue
        code = COUNTRY_NAME_MAP[name]
        values = []
        for v in parts[1:]:
            if not v:
                continue
            try:
                values.append(float(v.replace(",", "")))
            except ValueError:
                continue
        for d, v in zip(dates, values):
            result[code].append({"stat_date": d, "amount_usd_billion": v})

    return result


def _parse_table6(raw: str) -> dict[str, list[dict]]:
    """TSV 행: Country\tCode\tYYYY-MM\tholdings_millions\t...
    단위 백만달러 → 십억달러 변환"""
    result: dict[str, list[dict]] = {c["code"]: [] for c in TIC_COUNTRIES}

    for line in raw.splitlines()[9:]:   # 헤더 9행 스킵
        parts = [p.strip() for p in line.split("\t")]
        if len(parts) < 4:
            continue
        name, ym, val_str = parts[0], parts[2], parts[3]
        if name not in COUNTRY_NAME_MAP:
            continue
        if not val_str or not ym:
            continue
        try:
            d = _month_end(ym)
            amount_millions = float(val_str.replace(",", ""))
            result[COUNTRY_NAME_MAP[name]].append({
                "stat_date":          d,
                "amount_usd_billion": round(amount_millions / 1000, 1),
            })
        except (ValueError, IndexError):
            continue

    return result


def _merge(t5: dict, t6: dict) -> dict[str, list[dict]]:
    """Table 6 이력 + Table 5 최신 — 날짜 중복 시 Table 5 우선"""
    merged: dict[str, list[dict]] = {}
    all_codes = set(t5) | set(t6)
    for code in all_codes:
        t6_dates = {e["stat_date"]: e for e in t6.get(code, [])}
        t5_dates = {e["stat_date"]: e for e in t5.get(code, [])}
        combined = {**t6_dates, **t5_dates}   # t5 덮어씀
        merged[code] = sorted(combined.values(), key=lambda e: e["stat_date"])
    return merged


def collect(incremental: bool = True) -> dict[str, int]:
    logger.info("[TIC] slt_table5.txt + slt_table6.txt 다운로드 중...")
    try:
        raw5 = _get(_TABLE5_URL)
        raw6 = _get(_TABLE6_URL)
    except Exception as e:
        logger.error(f"[TIC] 다운로드 실패: {e}")
        return {c["code"]: -1 for c in TIC_COUNTRIES}

    parsed = _merge(_parse_table5(raw5), _parse_table6(raw6))
    start_date = date.fromisoformat(INITIAL_LOAD_START)
    results = {}

    for country in TIC_COUNTRIES:
        code = country["code"]
        name = country["name"]
        entries = parsed.get(code, [])

        if incremental:
            max_date = treasury_repository.get_max_date(code)
            if max_date:
                entries = [e for e in entries if e["stat_date"] > max_date]

        entries = [e for e in entries if e["stat_date"] >= start_date]

        rows = []
        for e in entries:
            fx = exchange_repository.get_rate(e["stat_date"])
            krw = round(e["amount_usd_billion"] * fx / 1000, 2) if fx else None
            rows.append({
                "country_code":        code,
                "country_name":        name,
                "stat_date":           e["stat_date"],
                "amount_usd_billion":  e["amount_usd_billion"],
                "exchange_rate":       fx,
                "amount_krw_trillion": krw,
            })

        saved = treasury_repository.upsert_many(rows)
        logger.info(f"[TIC] {name}({code}) {saved}건 저장")
        results[code] = saved

    return results
