-- ============================================================
-- 미국 거시경제 지표 수집 시스템 — 테이블 생성 스크립트
-- ============================================================

-- ============================================================
-- 1. 경제지표 마스터
-- ============================================================
CREATE TABLE IF NOT EXISTS indicator_master (
    indicator_id    BIGSERIAL       PRIMARY KEY,
    indicator_code  VARCHAR(50)     UNIQUE NOT NULL,    -- FRED Series ID 또는 자체 코드
    indicator_name  VARCHAR(200)    NOT NULL,           -- 지표명 (한글)
    unit            VARCHAR(50),                        -- 단위 (%, Index, Billions 등)
    source_name     VARCHAR(100),                       -- 데이터 소스 (FRED, TIC 등)
    fred_series_id  VARCHAR(50),                        -- FRED Series ID (FRED 소스인 경우)
    description     TEXT,                               -- 지표 설명
    created_at      TIMESTAMP       DEFAULT NOW()
);

-- 기본 지표 등록 (ISM PMI/NAPM은 FRED에서 비공개 전환으로 제외)
INSERT INTO indicator_master
    (indicator_code, indicator_name, unit, source_name, fred_series_id, description)
VALUES
    ('PCEPI',        '미국 PCE 물가지수',       'Index',    'FRED', 'PCEPI',        '개인소비지출(PCE) 물가지수. Fed 목표 물가지표.'),
    ('PAYEMS',       '미국 비농업고용(NFP)',     'Thousands','FRED', 'PAYEMS',       '비농업부문 신규 고용자수 (월간).'),
    ('UNRATE',       '미국 실업률',             '%',        'FRED', 'UNRATE',       '미국 실업률 (계절조정).'),
    ('GS10',         '미국 10년물 국채금리',    '%',        'FRED', 'DGS10',        '미국 10년 만기 국채 수익률 (DGS10, 월말 EOP).'),
    ('GS30',         '미국 30년물 국채금리',    '%',        'FRED', 'DGS30',        '미국 30년 만기 국채 수익률 (DGS30, 월말 EOP).'),
    ('MORTGAGE30US', '미국 모기지 금리',        '%',        'FRED', 'MORTGAGE30US', '30년 고정 주택담보대출 금리.'),
    ('FEDFUNDS',     '미국 기준금리',           '%',        'FRED', 'DFEDTARU',     'Fed Funds Upper Target Rate (DFEDTARU). FOMC 발표 기준금리 목표 상한.')
ON CONFLICT (indicator_code) DO NOTHING;

-- ============================================================
-- 2. 경제지표 시계열 데이터
-- ============================================================
CREATE TABLE IF NOT EXISTS indicator_data (
    data_id         BIGSERIAL       PRIMARY KEY,
    indicator_code  VARCHAR(50)     NOT NULL,           -- indicator_master.indicator_code 참조
    stat_date       DATE            NOT NULL,           -- 데이터 기준일 (월말 기준)
    value           NUMERIC(20, 6)  NOT NULL,           -- 지표 값
    created_at      TIMESTAMP       DEFAULT NOW(),
    updated_at      TIMESTAMP       DEFAULT NOW(),
    CONSTRAINT uq_indicator_data UNIQUE (indicator_code, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_indicator_data_01
    ON indicator_data (indicator_code, stat_date DESC);

-- ============================================================
-- 3. 미국 국채 보유 데이터 (일본·중국)
-- ============================================================
CREATE TABLE IF NOT EXISTS treasury_holding (
    holding_id              BIGSERIAL       PRIMARY KEY,
    country_code            VARCHAR(10)     NOT NULL,           -- 국가 코드 (JPN, CHN)
    country_name            VARCHAR(100)    NOT NULL,           -- 국가명
    stat_date               DATE            NOT NULL,           -- 기준일 (월말)
    amount_usd_billion      NUMERIC(20, 2)  NOT NULL,           -- 보유액 (십억 달러)
    exchange_rate           NUMERIC(20, 4),                     -- 적용 환율 (월말 USD/KRW)
    amount_krw_trillion     NUMERIC(20, 2),                     -- 원화 환산액 (조원)
    created_at              TIMESTAMP       DEFAULT NOW(),
    updated_at              TIMESTAMP       DEFAULT NOW(),
    CONSTRAINT uq_treasury_holding UNIQUE (country_code, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_treasury_holding_date
    ON treasury_holding (stat_date DESC);

CREATE INDEX IF NOT EXISTS idx_treasury_holding_country
    ON treasury_holding (country_code, stat_date DESC);

-- ============================================================
-- 4. 수집 로그
-- ============================================================
CREATE TABLE IF NOT EXISTS usa_collect_log (
    log_id          BIGSERIAL       PRIMARY KEY,
    collector_name  VARCHAR(100),                       -- 수집기 이름 (fred, tic, exchange)
    target_name     VARCHAR(100),                       -- 수집 대상 (지표코드 또는 국가명)
    started_at      TIMESTAMP,
    finished_at     TIMESTAMP,
    status          VARCHAR(20),                        -- success / error / skipped
    row_count       INTEGER,                            -- 저장된 행 수
    message         TEXT                                -- 오류 메시지 또는 메모
);

CREATE INDEX IF NOT EXISTS idx_usa_collect_log_started
    ON usa_collect_log (started_at DESC);
