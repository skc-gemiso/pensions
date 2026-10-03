"""
운용사별 분배금 공시 스크레이퍼.

세 운용사 모두 표를 JS 로 그려서 raw HTML 에는 빈 껍데기만 온다 → Playwright 필수.
돌려주는 레코드는 t_etf_dividend 컬럼과 같은 이름을 쓴다.

    {stock_code, ref_date, pay_date, dist_rate, dist_amt, tax_base_amt, stock_name, house}

운용사별로 못 주는 값이 있다 (삼성은 과세표준액 없음) → None 으로 둔다.
"""
import re
from datetime import date

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

MIRAE_URL   = "https://investments.miraeasset.com/tigeretf/ko/distribution/overall/list.do"
SAMSUNG_URL = "https://www.samsungfund.com/etf/product/distribution.do"
KB_URL      = "https://kbam.co.kr/support/notice"


# ── 공통 파서 ────────────────────────────────────────────────────────────────

def _num(s) -> float | None:
    """'1,234원' · '2.06%' · '\xa00\xa0' → 숫자. 빈 값이면 None."""
    if s is None:
        return None
    t = re.sub(r"[^\d.\-]", "", str(s).replace("\xa0", " "))
    if t in ("", "-", "."):
        return None
    try:
        return float(t)
    except ValueError:
        return None


def _date(s) -> date | None:
    """네 가지 표기를 한 군데서 흡수한다.

    2026-09-30 · 2026.09.30 · 2026. 09. 30   (화면 표)
    2026년 9월 30일(수)                       (KB 공지 본문)
    20260930                                  (삼성 엑셀 — 구분자 없음)
    """
    if not s:
        return None
    t = str(s).replace("\xa0", " ").strip()
    m = re.search(r"(\d{4})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})", t)
    if not m:
        m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})(?:\.0)?", t)   # 엑셀이 '20250115.0' 로 줄 때도 있다
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def _new_page(browser):
    # 1440px — 삼성·미래에셋은 좁은 뷰포트에서 레이아웃이 달라진다. 줄이지 말 것
    return browser.new_page(user_agent=UA, viewport={"width": 1440, "height": 1000})


# 삼성 페이지는 온보딩 팝업 dim 이 클릭을 먹어버린다 → 지우고 JS click 으로 누른다
_KILL_OVERLAY = "() => { document.querySelectorAll('[class*=onboarding]').forEach(e => e.remove()); return true; }"

_CLICK_BY_TEXT = """(label) => {
  const el = [...document.querySelectorAll('a,button')].find(x => (x.innerText || '').trim() === label);
  if (!el) return false;
  el.click();
  return true;
}"""


# ── 미래에셋 TIGER ───────────────────────────────────────────────────────────
# 구조화된 표 하나에 전 종목이 들어 있다. 연·월 select 로 범위를 줄이고
# 숨은 listCnt 를 키워 한 번에 받는다 (기본 20행, 총건수는 tr[data-tot-cnt]).

_MIRAE_SET = """(args) => {
  const el = id => document.getElementById(id);
  if (el('listCnt'))   el('listCnt').value = String(args.cnt);
  if (el('pageIndex')) el('pageIndex').value = '1';
  const y = document.querySelector('select[name=selectYear]');
  const m = document.querySelector('select[name=selectMonth]');
  const o = document.querySelector('select[name=orderB]');
  if (!y || !m) return false;
  y.value = String(args.year);
  m.value = String(args.month);
  if (o && args.order) { o.value = args.order; }
  m.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}"""

_MIRAE_READ = """() => {
  const trs = [...document.querySelectorAll('#listArea tr')];
  return {
    tot: trs.length ? Number(trs[0].getAttribute('data-tot-cnt') || 0) : 0,
    rows: trs.map(tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim().replace(/\\s+/g, ' ')))
             .filter(r => r.length >= 7)
  };
}"""


def scrape_mirae(browser, name_to_code: dict[str, str], log=print) -> list[dict]:
    """
    **엑셀다운로드** 를 눌러 받는다. 화면 표는 20행(listCnt 기본값)만 읽히고
    연·월 select 의 change 로도 재조회가 안 걸려 뒷행·과거 월을 볼 수 없었다.

    받은 '.xls' 는 실제로 **HTML 표**다 (OLE 가 아니라 `<!DOCTYPE` 로 시작) → xlrd 불필요.
    헤더: 종목명 | 유형 | 지급기준일 | 실제지급일 | 주당분배금(원) | 주당과세표준액(원) | 분배율(%)

    **종목코드 열이 없다.** 화면 표는 종목명 뒤 괄호에 코드가 있지만 엑셀에는 없어
    `name_to_code`(t_stock_list 의 종목명 → 코드) 로 맞춘다. 못 맞춘 행은 버린다.

    한계: 엑셀은 **화면에 걸린 기간만** 담는다 (기본 최신, 실측 34행). 과거 소급은 안 된다.
    """
    import tempfile

    out: list[dict] = []
    ctx = browser.new_context(user_agent=UA, viewport={"width": 1440, "height": 1000},
                              accept_downloads=True)
    pg = ctx.new_page()
    try:
        pg.goto(MIRAE_URL, wait_until="networkidle", timeout=60000)
        pg.wait_for_timeout(2500)
        with pg.expect_download(timeout=90000) as dl:
            if not pg.evaluate(_CLICK_BY_TEXT, "엑셀다운로드"):
                log("  [미래에셋] 엑셀다운로드 버튼을 찾지 못했습니다")
                return out
        path = f"{tempfile.gettempdir()}/mirae_dist.xls"
        dl.value.save_as(path)

        raw = open(path, "rb").read()
        html = next((raw.decode(e) for e in ("utf-8", "cp949", "euc-kr")
                     if _try_decode(raw, e)), None)
        if html is None:
            log("  [미래에셋] 엑셀 디코딩 실패")
            return out

        rows = []
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S | re.I):
            cells = [re.sub(r"<[^>]*>", "", c).replace("&nbsp;", " ").strip()
                     for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S | re.I)]
            if len(cells) >= 7:
                rows.append(cells)

        matched = 0
        for r in rows[1:]:                       # 0행은 헤더
            code = name_to_code.get(r[0].strip())
            ref  = _date(r[2])
            if not code or not ref:
                continue
            matched += 1
            out.append({
                "stock_code":   code,
                "stock_name":   r[0].strip(),
                "house":        "mirae",
                "ref_date":     ref,
                "pay_date":     _date(r[3]),
                "dist_amt":     _num(r[4]),
                "tax_base_amt": _num(r[5]),
                "dist_rate":    _num(r[6]),
            })
        log(f"  [미래에셋] 엑셀 {len(rows)}행 → 보유 종목 매칭 {matched}건 "
            f"(엑셀은 화면에 걸린 기간만 담습니다 — 과거 소급 불가)")
    finally:
        pg.close()
        ctx.close()
    return out


def _try_decode(raw: bytes, enc: str) -> bool:
    try:
        raw.decode(enc)
        return True
    except Exception:
        return False


# ── 삼성 KODEX ───────────────────────────────────────────────────────────────
# 넓은 화면(1440px)에서는 탭 구분 표로 렌더된다. 카드 한 장이 아래 꼴이라
# '자세히보기' 로 끊어 조각마다 파싱한다.
#
#   KODEX 200타겟위클리커버드콜
#   월중배당
#   |
#   개인ㆍ퇴직ㆍ498400
#   \t국내주식\t2026.09.15\t2026.09.17\t1.45\t300\t2\t
#              유형     지급기준일    실지급일   분배율 분배금 과세표준액
#
# 과세표준액이 없는 종목은 '-' 로 온다 → None.
# 좁은 뷰포트에서는 레이아웃이 달라 이 정규식이 안 맞는다. _new_page 의 viewport 를 줄이지 말 것.

def scrape_samsung(browser, log=print, tab: str = "상장이후") -> list[dict]:
    """
    화면 카드를 긁지 않고 **엑셀다운받기** 를 눌러 받는다.

    카드 목록은 기간 탭 기본값이 1개월이고 아래쪽이 지연 로딩돼 과거를 다 못 본다.
    엑셀은 선택한 기간 전체가 한 파일로 오고 `상품코드` 열이 따로 있어 종목 매칭이 정확하다.
    `상장이후` 탭이면 상장 이후 전부 (실측 2,225행).

    받은 파일은 레거시 BIFF(.xls) 라 xlrd 가 필요하다.
    헤더: 상품명 | 상품코드 | 유형 | 지급기준일 | 실지급일 | 분배율(%) | 주당분배금 | 주당과세표준액
    날짜는 YYYYMMDD, 값이 없는 칸은 '-'.
    """
    import tempfile
    import xlrd

    out: list[dict] = []
    ctx = browser.new_context(user_agent=UA, viewport={"width": 1440, "height": 1000},
                              accept_downloads=True)
    pg = ctx.new_page()
    try:
        pg.goto(SAMSUNG_URL, wait_until="networkidle", timeout=60000)
        pg.wait_for_timeout(2500)
        pg.evaluate(_KILL_OVERLAY)
        if not pg.evaluate(_CLICK_BY_TEXT, tab):
            log(f"  [삼성] '{tab}' 탭을 찾지 못했습니다 (페이지 구조 변경)")
            return out
        pg.wait_for_timeout(7000)
        pg.evaluate(_KILL_OVERLAY)

        with pg.expect_download(timeout=90000) as dl:
            if not pg.evaluate(_CLICK_BY_TEXT, "엑셀다운받기"):
                log("  [삼성] 엑셀다운받기 버튼을 찾지 못했습니다")
                return out
        path = f"{tempfile.gettempdir()}/samsung_dist.xls"
        dl.value.save_as(path)

        sheet = xlrd.open_workbook(path).sheet_by_index(0)
        header = next((r for r in range(min(10, sheet.nrows))
                       if "상품코드" in [str(c.value).strip() for c in sheet.row(r)]), None)
        if header is None:
            log("  [삼성] 엑셀에서 헤더(상품코드)를 찾지 못했습니다")
            return out

        col = {str(c.value).strip(): i for i, c in enumerate(sheet.row(header))}
        for r in range(header + 1, sheet.nrows):
            row = [str(c.value).strip() for c in sheet.row(r)]
            code = row[col["상품코드"]]
            if not re.fullmatch(r"[0-9A-Z]{6}", code):
                continue
            out.append({
                "stock_code":   code,
                "stock_name":   row[col["상품명"]],
                "house":        "samsung",
                "ref_date":     _date(row[col["지급기준일"]]),
                "pay_date":     _date(row[col["실지급일"]]),
                "dist_rate":    _num(row[col["분배율(%)"]]),
                "dist_amt":     _num(row[col["주당분배금"]]),
                "tax_base_amt": _num(row[col["주당과세표준액"]]),
            })
        log(f"  [삼성] 엑셀({tab}) {sheet.nrows}행 → 파싱 {len(out)}건")
    finally:
        pg.close()
        ctx.close()
    return out


# ── KB RISE ──────────────────────────────────────────────────────────────────
# 전용 현황 페이지가 없고 공지 게시글 본문에 표가 들어 있다.
#   *지급기준일 : 2026년 9월 30일(수)  /  *지급예정일 : 2026년 10월 2일(금)
#   종목 | 종목코드 | 좌당 예상분배금(원) | 좌당 과세분배금(원) | 분배율(%)
# 공지 목록 항목은 href 가 없는 role=button div 라 클릭해서 들어가야 한다.
# 분배금이 '예상' 으로 공시되고 변경 공지가 따로 나므로 확정치가 아니다.

# 공지 본문의 분배금 표. innerText 를 쪼개면 글마다 렌더링이 달라 놓친다 → DOM 으로 읽는다
_KB_TABLE = """() => {
  const t = document.querySelector('table');
  if (!t) return [];
  return [...t.querySelectorAll('tr')].map(tr =>
    [...tr.querySelectorAll('td,th')].map(c => c.innerText.replace(/\s+/g, ' ').trim()));
}"""

_KB_TITLES = """() => {
  return [...document.querySelectorAll('[role=button]')]
    .map((el, i) => ({ i: i, text: (el.innerText || '').replace(/\\s+/g, ' ').trim() }))
    .filter(x => x.text.includes('분배금'));
}"""


def scrape_kb(browser, max_notices: int = 12, log=print) -> list[dict]:
    out: list[dict] = []
    pg = _new_page(browser)
    try:
        pg.goto(KB_URL, wait_until="networkidle", timeout=60000)
        pg.wait_for_timeout(2000)
        titles = pg.evaluate(_KB_TITLES)
        log(f"  [KB] 분배금 공지 {len(titles)}건 중 최근 {min(max_notices, len(titles))}건 확인")

        for t in titles[:max_notices]:
            items = pg.query_selector_all("[role=button]")
            if t["i"] >= len(items):
                continue
            items[t["i"]].click()
            pg.wait_for_timeout(3500)
            body = pg.inner_text("body").replace("\xa0", " ")
            ref  = _date(re.search(r"지급기준일\s*[:：]?\s*([^\n]+)", body).group(1)) if "지급기준일" in body else None
            pay  = _date(re.search(r"지급(?:예정)?일\s*[:：]?\s*([^\n]+)", body).group(1)) if "지급예정일" in body else None
            log(f"     · {t['text'][:46]} → 기준일 {ref} 지급일 {pay} ({pg.url})")

            if ref:
                # 본문의 진짜 <table> 을 DOM 으로 읽는다.
                # 텍스트를 줄 단위로 쪼개 탭으로 나누면 공지마다 렌더링이 달라 놓친다 —
                # 어떤 글은 한 줄에 탭으로 구분되고(837), 어떤 글은 셀마다 줄이 바뀐다(835·833·829).
                # 그 탓에 보유 종목 0094M0 이 공지에 있는데도 한 건도 안 잡혔다.
                rows = pg.evaluate(_KB_TABLE)
                n = 0
                for cells in rows:
                    if len(cells) < 5 or not re.fullmatch(r"[0-9A-Z]{6}", cells[1]):
                        continue
                    n += 1
                    out.append({
                        "stock_code":   cells[1],
                        "stock_name":   cells[0],
                        "house":        "kb",
                        "ref_date":     ref,
                        "pay_date":     pay,
                        "dist_amt":     _num(cells[2]),
                        "tax_base_amt": _num(cells[3]),
                        "dist_rate":    _num(cells[4]),
                    })
                log(f"       종목 {n}건")
            pg.go_back(wait_until="networkidle", timeout=60000)
            pg.wait_for_timeout(2000)
    finally:
        pg.close()
    return out
