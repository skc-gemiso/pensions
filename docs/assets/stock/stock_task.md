# 주식 투자 — 기술 사양

## DB 스키마

### `my_stock` — 매입/매도 거래 원장

```sql
CREATE TABLE IF NOT EXISTS my_stock (
  id         SERIAL,                          -- 자동 증가 PK (기존 테이블 ALTER로 추가)
  stock_code VARCHAR(20)  NOT NULL,           -- 종목코드 (대문자)
  s_date     VARCHAR(8)   NOT NULL,           -- 거래일 (YYYYMMDD 문자열)
  cnt        INT          NOT NULL,           -- 1=매입, 2=매도
  stock_type INT          NOT NULL DEFAULT 1, -- 1=주식, 2=ETF
  qty        NUMERIC      NOT NULL,           -- 수량 (주)
  s_amt      NUMERIC      NOT NULL,           -- 단가 (원)
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
ALTER TABLE my_stock ADD COLUMN IF NOT EXISTS id SERIAL;
```

- 잔고 계산: `SUM(CASE WHEN cnt=1 THEN qty ELSE -qty END)` — 매입 합산, 매도 차감
- 평균 매입가: `SUM(매입qty × s_amt) / SUM(매입qty)`
- 잔고 > 0인 종목만 포트폴리오 표시

### `t_stock_amt` — 종목별 일별 주가

```sql
CREATE TABLE IF NOT EXISTS t_stock_amt (
  e_date     DATE         NOT NULL,    -- 기준일 (PK)
  stock_code VARCHAR(20)  NOT NULL,    -- 종목코드 (PK)
  e_amt      NUMERIC,                  -- 종가 (원)
  c_amt      NUMERIC,                  -- 전일대비 금액 (원)
  e_rate     NUMERIC,                  -- 등락률 (%)
  e_trade    NUMERIC,                  -- 거래량
  finish_yn  VARCHAR(1),               -- 수집 완료 여부 ('Y')
  stock_type VARCHAR(10),              -- 종목 구분
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (e_date, stock_code)
);
```

- `(e_date, stock_code)` PRIMARY KEY → UPSERT `ON CONFLICT (e_date, stock_code)`
- 최신 종가: `ORDER BY e_date DESC LIMIT 1`
- 전일 종가: `ORDER BY e_date DESC LIMIT 1 OFFSET 1`

### `t_stock_list` — 종목 검색 마스터

| 컬럼 | 설명 |
|------|------|
| `stock_code` | 종목코드 |
| `stock_name` | 종목명 |
| `stock_short_name` | 종목 약칭 (있으면 우선 표시) |
| `market_type` | 시장 구분 (KOSPI/KOSDAQ 등) |
| `listed_shares` | 상장주식수 (정렬 기준) |
| `default_yn` | 빈 검색 시 인기 종목 여부 (`'Y'`) |

---

## 서버 액션 (`app/assets/stock/actions.ts`)

| 함수 | 설명 | 인증 |
|------|------|------|
| `getMarketIndices()` | KOSPI·KOSDAQ 지수 조회 (네이버 모바일 API) | 없음 |
| `getHoldings()` | 보유 종목 집계 (잔고·평균매입가·현재가·전일가) | 세션 필요 |
| `getTransactions(stockCode?)` | 거래 내역 조회 (전체 또는 종목별) | 세션 필요 |
| `addTransaction(data)` | 거래 내역 INSERT | 세션 필요 |
| `deleteTransaction(id)` | 거래 내역 DELETE | 세션 필요 |
| `searchStockList(q)` | 종목 검색 (`t_stock_list`) | 세션 필요 |
| `getDailyPrices(stockCode)` | 일별 주가 조회 (`t_stock_amt`) | 세션 필요 |
| `fetchAndSaveNaverPrices(stockCode, stockType)` | 네이버 `sise_day.naver` 수집 → `t_stock_amt` 저장, 저장 건수 반환 | 세션 필요 |
| `getDefaultStockList()` | `t_stock_list`에서 `default_yn='Y'` 전체 목록 반환 | 없음 |

### 타입 정의

```typescript
type MarketIndex = {
  name:       string
  price:      number
  change:     number
  changeRate: number
}

type StockTransaction = {
  id: number
  stock_code: string
  s_date: string    // YYYYMMDD
  cnt: number       // 1=매입, 2=매도
  stock_type: number
  qty: number
  s_amt: number
  created_at: string
}

type StockHolding = {
  stock_code: string
  stock_name: string | null
  stock_type: number
  net_qty: number
  avg_buy_price: number
  total_buy_amount: number
  latest_price: number | null   // t_stock_amt.e_amt 최신 종가
  latest_date:  string | null   // t_stock_amt.e_date 최신 기준일 (YYYY-MM-DD)
  prev_price:   number | null   // t_stock_amt.e_amt 전일 종가
}

type DailyPrice = {
  s_date: string    // YYYY-MM-DD (t_stock_amt.e_date)
  amt: number       // t_stock_amt.e_amt 종가
}

type StockListItem = { code: string; name: string; market: string }
```

---

## 네이버 주가 수집 로직

### 대상 URL

```
https://finance.naver.com/item/sise_day.naver?code={종목코드}&page={N}
```

- 응답: EUC-KR 인코딩 HTML
- 페이지당 약 10영업일 데이터

### 수집 흐름 (`fetchAndSaveNaverPrices`)

1. 오늘 날짜(`todayStr`) `t_stock_amt` 레코드 삭제 (당일 재수집)
2. `MAX(e_date)` 조회 → `maxDateStr`
3. `maxDateStr` 있으면 `maxPage = 6` (증분), 없으면 마지막 페이지까지 전체 수집
4. 3페이지씩 병렬 요청(배치) → `maxDateStr` 도달 시 수집 중단
5. 중복 날짜 제거 (Set 기반)
6. `t_stock_amt` UPSERT (`ON CONFLICT (e_date, stock_code) DO UPDATE`)
7. INSERT 컬럼: `(e_date, stock_code, e_amt, c_amt, e_rate, e_trade, finish_yn)` (stock_type 제외)

### HTML 파싱 (`_parseSiseDay`)

- `</tr>` 기준으로 분할
- 날짜 추출: `(\d{4})\.(\d{2})\.(\d{2})` → `YYYY-MM-DD` 변환
- 종가 추출: `<span class="tah p11">([\d,]+)</span>` → 쉼표 제거 후 숫자 변환
- 전일비(c_amt) 추출: `<em>` 태그 내 숫자, class `bu_pdn`=하락(음수), `bu_pup`=상승(양수)
- 등락률(e_rate) 추출: 전일비 다음 `<span class="tah p11">` 값 → % 단위 (부호 별도 적용)

### 요청 헤더

```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
Referer: https://finance.naver.com/item/main.naver?code={종목코드}
Accept: text/html,application/xhtml+xml
Accept-Language: ko-KR,ko;q=0.9
```

---

## API 라우트

### `GET /api/cron/stock-sync` — Vercel Cron 주가 수집 엔드포인트

- 인증: `Authorization: Bearer {CRON_SECRET}` 헤더 또는 `?secret={CRON_SECRET}` 쿼리 파라미터
- `t_stock_list` 에서 `default_yn='Y'` 종목 전체 조회 후 `syncStock()` 순차 실행
- 응답: `{ ok: true, synced: { [stockCode]: 저장건수|에러문자열 }, at: ISO타임스탬프 }`

### `GET /api/stock/price` — 네이버 실시간 가격 프록시 (현재 미사용)

- 쿼리: `?codes=005930,069500` (콤마 구분 종목코드)
- `m.stock.naver.com/api/stock/{code}/basic` 프록시
- 응답: `Record<string, { price, change, changeRate, name, volume }>`

### `GET /api/stock/daily` — 네이버 candle API 프록시 (현재 미사용)

- 쿼리: `?code=005930&count=500`
- `m.stock.naver.com/api/stock/{code}/candle/day?count={N}` 프록시
- 응답: `{ candles: NaverCandle[] }`

### `GET /api/stock/search` — 네이버 자동완성 프록시 (현재 미사용)

- 쿼리: `?q=삼성`
- `ac.finance.naver.com/ac` 자동완성 API 프록시
- 응답: `StockSearchItem[]` (code, name, market)

---

## Vercel Cron 스케줄 (`vercel.json`)

```json
{
  "crons": [
    {
      "path": "/api/cron/stock-sync",
      "schedule": "30 11 * * *"
    }
  ]
}
```

- `30 11 * * *` = UTC 11:30 = KST 20:30 (매일)
- Vercel이 `Authorization: Bearer {CRON_SECRET}` 헤더를 자동 주입

---

## 독립 실행 스크립트 (`scripts/sync-stock-prices.mjs`)

```bash
node scripts/sync-stock-prices.mjs
```

- 환경 변수: `PENSION_SIM_DB_HOST`, `PENSION_SIM_DB_PORT`, `PENSION_SIM_DB_NAME`, `PENSION_SIM_DB_USER`, `PENSION_SIM_DB_PASSWORD`
- `pg` Pool 직접 연결 (Next.js 외부 실행)
- 수집 로직은 cron 엔드포인트와 동일 (sise_day.naver 파싱 + UPSERT)

---

## DB 마이그레이션

### `v015_add_stock_menu` (`lib/auth-db.ts`)

```sql
INSERT INTO app_menus (id, label, href, parent_id, sort_order)
VALUES ('stock', '주식 투자', '/assets/stock', 'assets', 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO app_role_menus (role, menu_id)
VALUES ('admin', 'stock')
ON CONFLICT DO NOTHING;
```

- `app_menus` 에 `stock` 메뉴 추가 (`assets` 하위, sort_order 10)
- `admin` 역할에만 접근 권한 부여

---

## 컴포넌트 설명 (`app/assets/stock/page.tsx`)

- `"use client"` 클라이언트 컴포넌트
- Recharts: `LineChart`, `Line`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `ResponsiveContainer`, `ReferenceLine`
- `fmt(n, dec?)` / `cc(v)`: `lib/fmt.ts` 숫자 포맷·색상 유틸
- `AppLayout`: 공통 사이드바 레이아웃 (`components/AppLayout.tsx`)

### 주요 상태

| 상태 | 타입 | 설명 |
|------|------|------|
| `holdings` | `StockHolding[]` | 보유 종목 목록 |
| `selectedCode` | `string \| null` | 차트 표시 대상 종목코드 |
| `marketIndices` | `{ kospi, kosdaq }` | 코스피·코스닥 지수 |
| `dailyPrices` | `DailyPrice[]` | 선택 종목 일별 주가 |
| `chartDays` | `number` | 차트 기간 필터 (30/90/180/365/9999) |
| `transactions` | `StockTransaction[]` | 전체 거래 내역 |
| `activeTab` | `"portfolio" \| "history"` | 현재 탭 |
| `showModal` | `boolean` | 매입/매도 추가 모달 표시 여부 |
| `form` | `FormState` | 모달 입력 폼 상태 |
| `tooltip` | `{ code, x, y } \| null` | 호버 툴팁 위치 |

### 포트폴리오 계산 (`portfolioRows`)

```typescript
const curPrice  = h.latest_price                           // t_stock_amt 최신값
const evalAmt   = curPrice != null ? Math.round(curPrice * h.net_qty) : null
const pnl       = evalAmt != null ? evalAmt - h.total_buy_amount : null
const pnlRate   = pnl / h.total_buy_amount * 100           // 수익률(%)
const priceChange     = curPrice - h.prev_price            // 전일대비
const priceChangeRate = priceChange / h.prev_price * 100   // 전일대비율(%)
```

- `portfolioRows`: 평가금액 큰 순으로 정렬

### 종목 검색 (모달)

- 입력 시 200ms 디바운스 후 `searchStockList(q)` 호출
- 포커스 시 빈 쿼리로 즉시 호출 → `default_yn='Y'` 인기 종목 20개 표시
- 선택 후 칩 표시, × 버튼으로 초기화
- onBlur 150ms 지연 후 드롭다운 닫기 (클릭 이벤트 처리를 위해)
