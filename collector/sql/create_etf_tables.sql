-- ============================================================
-- BlackRock ETF 보유 종목 분석 — 테이블 생성 스크립트
-- ============================================================

CREATE TABLE IF NOT EXISTS etf_holdings (
    id              BIGSERIAL PRIMARY KEY,
    etf_ticker      VARCHAR(10)     NOT NULL,           -- ETF 코드 (IEMG, EEM, EWY)
    holding_date    DATE            NOT NULL,           -- 데이터 기준일
    ticker          VARCHAR(20)     NOT NULL,           -- 종목 코드
    name            VARCHAR(255)    NOT NULL,           -- 종목명
    sector          VARCHAR(100),                       -- 섹터
    asset_class     VARCHAR(50),                        -- 자산 분류 (Equity / Cash 등)
    market_value    NUMERIC(25, 2),                     -- 시장 가치
    weight_pct      NUMERIC(10, 6),                     -- 비중 (%)
    notional_value  NUMERIC(25, 2),                     -- 명목 가치
    shares          NUMERIC(20, 2),                     -- 보유 주식 수량 (Quantity)
    price           NUMERIC(20, 6),                     -- 주가
    location        VARCHAR(100),                       -- 상장 국가/지역
    exchange        VARCHAR(50),                        -- 거래소
    currency        VARCHAR(10),                        -- 통화
    fx_rate         NUMERIC(15, 6),                     -- 환율
    market_currency VARCHAR(10),                        -- 시장 통화
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    UNIQUE (etf_ticker, holding_date, ticker)
);

CREATE INDEX IF NOT EXISTS idx_etf_holdings_etf_date ON etf_holdings (etf_ticker, holding_date DESC);
CREATE INDEX IF NOT EXISTS idx_etf_holdings_ticker   ON etf_holdings (ticker);
CREATE INDEX IF NOT EXISTS idx_etf_holdings_name     ON etf_holdings (name);

CREATE TABLE IF NOT EXISTS etf_fetch_log (
    id           BIGSERIAL PRIMARY KEY,
    etf_ticker   VARCHAR(10)   NOT NULL,
    holding_date DATE          NOT NULL,
    fetched_at   TIMESTAMPTZ   DEFAULT NOW(),
    status       VARCHAR(20)   NOT NULL,   -- success / error / skipped
    row_count    INTEGER,
    error_msg    TEXT,
    UNIQUE (etf_ticker, holding_date)
);


-- ============================================================
-- 한국 주식 상장사 목록
-- 데이터 출처 : https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020201
-- 카카오톡 로그인 후 링크로 이동해서 데이터를 CSV 파일로 저장 후 조회.(마지막 listing_date 이후 데이터부터만 수집 하면됨)
-- ============================================================
CREATE TABLE t_stock_list (
	stock_code       VARCHAR(6) PRIMARY KEY,
	isin_code        VARCHAR(20) NULL,
	stock_name       VARCHAR(200) NULL,
	stock_short_name VARCHAR(200) NULL,
	stock_name_eng   VARCHAR(300) NULL,
	listing_date     DATE NULL,
	market_type      VARCHAR(50) NULL,
	security_type    VARCHAR(50) NULL,
	department       VARCHAR(50) NULL,
	stock_type       VARCHAR(50) NULL,
	par_value        NUMERIC(18, 2) NULL,
	listed_shares    NUMERIC(18, 0) NULL,
	default_yn       VARCHAR(1) DEFAULT 'N'::character varying NULL,
	created_at       TIMESTAMPTZ DEFAULT NOW(),
	updated_at       TIMESTAMPTZ DEFAULT NOW(),
	UNIQUE (isin_code)
);

