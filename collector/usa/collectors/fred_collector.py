from datetime import date
import calendar
import requests
from utils.logger import logger
from utils.retry import http_retry
from config.settings import FRED_API_KEY, FRED_BASE_URL, FRED_SERIES, INITIAL_LOAD_START, FOMC_DECISION_DATES
from repositories import indicator_repository

# FOMC 결정 발표일에 값을 저장하는 시리즈 (금리 동결 시에도 발표일 기록)
_FOMC_SERIES = {"DFEDTARU"}

# EOP 월집계 후 날짜를 월말로 보정할 시리즈 (FRED는 1일 라벨 반환)
_MONTH_END_SERIES = {"DGS10", "DGS30"}


def _to_month_end(date_str: str) -> str:
    d = date.fromisoformat(date_str)
    last_day = calendar.monthrange(d.year, d.month)[1]
    return date(d.year, d.month, last_day).isoformat()


def _fetch(series_id: str, start: str, end: str) -> list[dict]:
    params = {
        "series_id":         series_id,
        "observation_start": start,
        "observation_end":   end,
        "api_key":           FRED_API_KEY,
        "file_type":         "json",
        "frequency":         "m",
        "aggregation_method": "eop",
    }
    resp = requests.get(FRED_BASE_URL, params=params, timeout=30)
    if resp.status_code == 400:
        params.pop("aggregation_method", None)
        resp = requests.get(FRED_BASE_URL, params=params, timeout=30)
    if resp.status_code == 400:
        params.pop("frequency", None)
        resp = requests.get(FRED_BASE_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json().get("observations", [])


def _fetch_fomc_dates(series_id: str, start: str, end: str) -> list[dict]:
    """FOMC 결정 발표일 기준으로 DFEDTARU 값을 반환. 금리 동결 시에도 발표일 기록."""
    params = {
        "series_id":         series_id,
        "observation_start": start,
        "observation_end":   end,
        "api_key":           FRED_API_KEY,
        "file_type":         "json",
    }
    resp = requests.get(FRED_BASE_URL, params=params, timeout=30)
    resp.raise_for_status()
    observations = resp.json().get("observations", [])

    # 날짜 → 값 맵 구성
    date_value: dict[str, float] = {}
    for obs in observations:
        if obs["value"] not in (".", ""):
            date_value[obs["date"]] = float(obs["value"])

    # FOMC 결정일 기준으로 필터링 (해당일 값 없으면 직전 영업일 값 사용)
    all_dates = sorted(date_value.keys())
    result = []
    for fomc_date in sorted(FOMC_DECISION_DATES):
        if fomc_date < start or fomc_date > end:
            continue
        value = date_value.get(fomc_date)
        if value is None:
            # 직전 영업일 값 사용
            prior = [d for d in all_dates if d <= fomc_date]
            if prior:
                value = date_value[prior[-1]]
        if value is not None:
            result.append({"date": fomc_date, "value": str(value)})

    return result


def collect(incremental: bool = True) -> dict[str, int]:
    """
    incremental=True : DB 최대날짜 이후 데이터만 수집
    incremental=False: INITIAL_LOAD_START 부터 전체 적재
    """
    indicator_repository.upsert_master_many([
        {
            "indicator_code": code,
            "indicator_name": name,
            "unit":           unit,
            "source_name":    "FRED",
            "fred_series_id": series_id,
        }
        for code, series_id, name, unit in FRED_SERIES
    ])

    end = date.today().isoformat()
    results = {}

    for indicator_code, series_id, name, _ in FRED_SERIES:
        is_fomc = series_id in _FOMC_SERIES
        if incremental:
            max_date = indicator_repository.get_max_date(indicator_code)
            if max_date:
                start = max_date.isoformat() if is_fomc else max_date.replace(day=1).isoformat()
            else:
                start = INITIAL_LOAD_START
        else:
            start = INITIAL_LOAD_START

        logger.info(f"[FRED] {indicator_code} ({series_id}) {start} ~ {end}")
        try:
            observations = _fetch_fomc_dates(series_id, start, end) if is_fomc else _fetch(series_id, start, end)
            rows = [
                {
                    "indicator_code": indicator_code,
                    "stat_date":      _to_month_end(obs["date"]) if series_id in _MONTH_END_SERIES else obs["date"],
                    "value":          float(obs["value"]),
                }
                for obs in observations
                if obs["value"] not in (".", "")
            ]
            saved = indicator_repository.upsert_many(rows)
            logger.info(f"[FRED] {indicator_code} → {saved}건 저장")
            results[indicator_code] = saved
        except Exception as e:
            logger.error(f"[FRED] {indicator_code} 실패: {e}")
            results[indicator_code] = -1

    return results
