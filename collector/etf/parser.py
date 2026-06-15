"""BlackRock iShares CSV 다운로드 및 파싱 모듈"""
import re
import io
from datetime import date, datetime
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / "config" / ".env")

_PRODUCT_PAGES = {
    "IEMG": "https://www.ishares.com/us/products/244050/ishares-core-msci-emerging-markets-etf",
    "EEM":  "https://www.ishares.com/us/products/239637/ishares-msci-emerging-markets-etf",
    "EWY":  "https://www.ishares.com/us/products/239681/ishares-msci-south-korea-capped-etf",
}

_COL_MAP = {
    "ticker":          "ticker",
    "name":            "name",
    "sector":          "sector",
    "asset class":     "asset_class",
    "market value":    "market_value",
    "weight (%)":      "weight_pct",
    "weight(%)":       "weight_pct",
    "notional value":  "notional_value",
    "quantity":        "shares",
    "shares":          "shares",
    "price":           "price",
    "location":        "location",
    "exchange":        "exchange",
    "currency":        "currency",
    "fx rate":         "fx_rate",
    "market currency": "market_currency",
}

_EQUITY_CLASSES = {"equity"}

# --- Playwright 브라우저 싱글턴 ---
_pw = None
_browser = None
_context = None


def _get_context():
    """Playwright 브라우저 컨텍스트를 싱글턴으로 반환."""
    global _pw, _browser, _context
    if _context is not None:
        return _context
    from playwright.sync_api import sync_playwright
    _pw = sync_playwright().start()
    _browser = _pw.chromium.launch(headless=True)
    _context = _browser.new_context(
        accept_downloads=True,
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        extra_http_headers={
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    # 제품 페이지 방문 → 쿠키 동의 팝업 처리 → 도메인 쿠키/토큰 세팅
    page = _context.new_page()
    page.goto(_PRODUCT_PAGES["IEMG"], wait_until="load", timeout=60000)
    page.wait_for_timeout(3000)
    for selector in [
        "#onetrust-accept-btn-handler",
        'button:has-text("Accept All")',
        'button:has-text("Accept Cookies")',
        'button:has-text("Accept")',
    ]:
        try:
            btn = page.locator(selector).first
            if btn.is_visible(timeout=2000):
                btn.click()
                page.wait_for_timeout(2000)
                break
        except Exception:
            continue
    page.close()
    return _context


def close_browser():
    """프로세스 종료 전 브라우저 정리."""
    global _pw, _browser, _context
    if _browser:
        _browser.close()
    if _pw:
        _pw.stop()
    _pw = _browser = _context = None


def _parse_date(text: str) -> date | None:
    text = text.strip().strip('"').strip("'")
    if text in ("-", "", "N/A"):
        return None
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%B %d", "%b %d",
                "%m/%d/%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            d = datetime.strptime(text, fmt)
            if d.year == 1900:
                d = d.replace(year=date.today().year)
            return d.date()
        except ValueError:
            continue
    return None


def _clean_number(val):
    if pd.isna(val):
        return None
    s = str(val).replace(",", "").replace("%", "").strip().strip('"')
    if s in ("-", "", "N/A", "n/a", "nan"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def download_csv(etf_ticker: str) -> bytes:
    """
    제품 페이지에서 'Detailed Holdings and Analytics' 클릭으로 최신 CSV 다운로드.
    """
    product_url = _PRODUCT_PAGES.get(etf_ticker.upper())
    if not product_url:
        raise ValueError(f"알 수 없는 ETF: {etf_ticker}")

    ctx = _get_context()
    page = ctx.new_page()
    raw = b""

    try:
        page.goto(product_url, wait_until="load", timeout=60000)
        page.wait_for_timeout(5000)

        with page.expect_download(timeout=60000) as dl_info:
            page.get_by_text("Detailed Holdings and Analytics").first.click()

        dl_path = dl_info.value.path()
        if dl_path:
            raw = Path(dl_path).read_bytes()

    except Exception:
        raise

    finally:
        page.close()

    return raw


def parse_csv(raw: bytes, etf_ticker: str) -> tuple[date | None, list[dict]]:
    """
    BlackRock CSV 바이트 -> (holding_date, records).
    holding_date=None 은 데이터 없음(휴일 등).
    """
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    if text.lstrip().startswith("<!DOCTYPE") or text.lstrip().startswith("<html"):
        return None, []

    lines = text.splitlines()
    holding_date: date | None = None
    header_line_idx: int | None = None

    for i, line in enumerate(lines):
        m = re.search(r'(?:Fund Holdings as of|As of)[,\s]+"?([^"\r\n]+)"?', line, re.IGNORECASE)
        if m:
            holding_date = _parse_date(m.group(1))

        stripped = line.strip()
        if stripped.lower().startswith("ticker,") and line.count(",") >= 4:
            header_line_idx = i
            break

    if header_line_idx is None:
        return holding_date, []

    data_text = "\n".join(lines[header_line_idx:])
    df = pd.read_csv(io.StringIO(data_text), dtype=str, on_bad_lines="skip")
    df.columns = [c.strip().lower() for c in df.columns]
    rename = {c: _COL_MAP[c] for c in df.columns if c in _COL_MAP}
    df = df.rename(columns=rename)

    for req in ("ticker", "name"):
        if req not in df.columns:
            return holding_date, []

    df["ticker"] = df["ticker"].str.strip().str.strip('"')
    df["name"]   = df["name"].str.strip().str.strip('"')
    df = df[df["ticker"].notna() & (df["ticker"] != "")]
    df = df[df["name"].notna()   & (df["name"] != "")]

    if "asset_class" in df.columns:
        df["asset_class"] = df["asset_class"].str.strip().str.strip('"')
        df = df[df["asset_class"].str.lower().isin(_EQUITY_CLASSES)]

    records = []
    for _, row in df.iterrows():
        ticker = str(row.get("ticker", "")).strip()
        if not ticker:
            continue
        records.append({
            "etf_ticker":      etf_ticker.upper(),
            "holding_date":    holding_date,
            "ticker":          ticker,
            "name":            str(row.get("name", "")).strip(),
            "sector":          str(row.get("sector", "")).strip() or None,
            "asset_class":     str(row.get("asset_class", "")).strip() or None,
            "market_value":    _clean_number(row.get("market_value")),
            "weight_pct":      _clean_number(row.get("weight_pct")),
            "notional_value":  _clean_number(row.get("notional_value")),
            "shares":          _clean_number(row.get("shares")),
            "price":           _clean_number(row.get("price")),
            "location":        str(row.get("location", "")).strip() or None,
            "exchange":        str(row.get("exchange", "")).strip() or None,
            "currency":        str(row.get("currency", "")).strip() or None,
            "fx_rate":         _clean_number(row.get("fx_rate")),
            "market_currency": str(row.get("market_currency", "")).strip() or None,
        })

    return holding_date, records
