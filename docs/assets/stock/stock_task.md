# 주식 투자 — 기술 사양

## DB 스키마

### `my_stock` — 매입/매도 거래 원장

```sql
CREATE TABLE IF NOT EXISTS my_stock (
  id         SERIAL,                          -- 자동 증가 PK (기존 테이블 ALTER로 추가)
  account_no VARCHAR(20),                     -- 계좌번호 (my_account FK)
  stock_code VARCHAR(20)  NOT NULL,           -- 종목코드 (대문자)
  s_date     VARCHAR(8)   NOT NULL,           -- 거래일 (YYYYMMDD 문자열)
  cnt        INT          NOT NULL,           -- 1=매입, 2=매도 (qty 부호에서 파생)
  stock_type INT          NOT NULL DEFAULT 1, -- 1=주식, 2=ETF
  fund_type  INT          NOT NULL DEFAULT 1, -- 1=현금, 2=분배금 (매입 행에만 의미)
  qty        NUMERIC      NOT NULL,           -- 수량 (주) — 양수=매입, 음수=매도
  s_amt      NUMERIC      NOT NULL,           -- 단가 (원)
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
ALTER TABLE my_stock ADD COLUMN IF NOT EXISTS id SERIAL;
ALTER TABLE my_stock ADD COLUMN IF NOT EXISTS fund_type INT NOT NULL DEFAULT 1;
```

- 잔고 계산: `SUM(qty)` — 매입(양수) 합산, 매도(음수) 차감
- 평균 매입가: `SUM(매입qty × s_amt) / SUM(매입qty)`
- 잔고 > 0인 종목만 포트폴리오 표시

#### `fund_type` — 투자한 돈의 출처

| 값 | 의미 |
|----|------|
| `1` | 현금 — 내 주머니에서 새로 넣은 돈 |
| `2` | 분배금 — 이 투자에서 받은 분배금을 재투자한 돈 |

매도 행(`qty < 0`)에는 의미가 없어 항상 기본값 `1` 로 둔다.
기존 데이터는 마이그레이션 시 전부 `1`(현금)로 채워진다 — 분배금 재투자였던 건은 화면에서 직접 고친다.

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

### `t_etf_dividend` — ETF 분배금 지급 이력

배당 수익률 팝업의 데이터 원천. 월 1건씩 쌓인다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `stock_code` | VARCHAR(20) NOT NULL | 종목코드 (PK) |
| `ref_date` | DATE NOT NULL | 지급기준일 (PK) |
| `pay_date` | DATE | 실지급일 |
| `dist_rate` | NUMERIC(6,2) | 분배율(%) — 운용사 공시값을 그대로 입력 |
| `dist_amt` | NUMERIC(10,0) | 주당 분배금(원) |
| `tax_base_amt` | NUMERIC(10,0) | 주당 과세표준액(원) |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

- PK `(stock_code, ref_date)` → 같은 기준일 중복 등록 불가
- 조회는 `getEtfDividendHistory` (`app/sim/actions.ts`), 계좌별 환산은 `getMonthlyDividendByAccount`

---

## 서버 액션 (`app/assets/stock/actions.ts`)

| 함수 | 설명 | 인증 |
|------|------|------|
| `getMarketIndices()` | KOSPI·KOSDAQ 지수 조회 (네이버 모바일 API) | 없음 |
| `getHoldings()` | 보유 종목 집계 (잔고·평균매입가·현재가·전일가) | 세션 필요 |
| `getTransactions(stockCode?)` | 거래 내역 조회 (전체 또는 종목별) | 세션 필요 |
| `addTransaction(data)` | 거래 내역 INSERT (`fund_type` 포함) + `my_account_info` 대응 행 자동 생성. 분배금 매입이면 비고에 `매입(분배금): {코드}` | 세션 필요 |
| `updateTransaction(data)` | 거래 내역 1건 UPDATE (`id` 로 찾음). `cnt` 는 `qty` 부호에서 다시 파생. **`my_account_info` 자동 생성 행은 건드리지 않는다** | 세션 필요 |
| `deleteTransaction(id)` | 거래 내역 DELETE. **`my_account_info` 자동 생성 행은 남는다** | 세션 필요 |
| `searchStockList(q)` | 종목 검색 (`t_stock_list`) | 세션 필요 |
| `getDailyPrices(stockCode)` | 일별 주가 조회 (`t_stock_amt`) | 세션 필요 |
| `fetchAndSaveNaverPrices(stockCode, stockType)` | 네이버 `sise_day.naver` 수집 → `t_stock_amt` 저장, 저장 건수 반환 | 세션 필요 |
| `getDefaultStockList()` | `t_stock_list`에서 `default_yn='Y'` 전체 목록 반환 | 없음 |
| `getAccounts()` | 계좌 목록 (`my_account`) — 계좌번호·계좌명 | 세션 필요 |
| `getAccountInfo()` | 계좌 입출금 내역 (`my_account_info` + `my_account` JOIN) | 세션 필요 |
| `addAccountInfo(data)` | 계좌 입출금 내역 INSERT (`account_no`, `trade_date`, `in_out`, `amt`, `memo`) | 세션 필요 |
| `getMonthlyDividendByAccount(stockCode)` | 분배금 지급기준일별 계좌 보유수량·분배금·세금. 각 기준일의 **해당 월 13일까지 누적 순수량** 기준. 배당 팝업의 **지급 이력 테이블 전용** — 요약 카드는 현재 잔고를 쓴다 | 세션 필요 |
| `addEtfDividend(data)` | `t_etf_dividend` 1건 INSERT. 같은 `(stock_code, ref_date)` 가 이미 있으면 덮어쓰지 않고 예외 — 배당 팝업의 `[+ 분배금 추가]` 에서 호출 | 세션 필요 |
| `updateEtfDividend(data)` | `t_etf_dividend` 1건 UPDATE. `orig_ref_date` 로 행을 찾고 `ref_date`(PK 포함) 5개 값과 `updated_at` 을 갱신. 바꾼 `ref_date` 가 다른 행과 겹치면 예외, 대상 행이 없어도 예외 — 지급 이력 행의 `[수정]` 에서 호출 | 세션 필요 |

### 분배금 입력 폼 (`app/assets/stock/DividendForm.tsx`)

추가·수정 인라인 폼과 엑셀 붙여넣기 파서(`parseDividendPaste`)는 이 컴포넌트에 있다.
주식 투자 팝업과 연금투자 시뮬레이션(`/sim`) 분배금 팝업이 함께 쓴다.

```typescript
DividendForm({
  stockCode: string,
  editRow: EtfDividendRow | null,   // null → 추가, 행 → 수정 (orig_ref_date = editRow.ref_date)
  onSaved: () => Promise<void> | void,  // 부모가 이력 재조회 후 폼을 닫는다
  onCancel: () => void,
})
```

- 초기값은 마운트 시 한 번만 읽는다 → 수정할 행을 바꿀 때 부모가 `key={editRow?.ref_date ?? "new"}` 로 다시 마운트
- 입력 상태·저장 중·오류·붙여넣기 안내는 컴포넌트 내부 state. 부모는 `showDivForm`·`divEditRow` 만 가진다

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
  account_no: string
  stock_code: string
  s_date: string    // YYYYMMDD
  cnt: number       // 1=매입, 2=매도
  stock_type: number
  fund_type: number // 1=현금, 2=분배금
  qty: number       // 양수=매입, 음수=매도
  s_amt: number
  created_at: string
}

type StockHolding = {
  account_no: string
  account_nm: string | null
  stock_code: string
  stock_name: string | null
  stock_type: number
  net_qty: number
  avg_buy_price: number
  total_buy_amount: number
  total_buy_amount_cash: number // 위 금액 중 현금 매입 몫 (잔고 비례)
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
https://m.stock.naver.com/api/stock/{종목코드}/price?pageSize=60&page={N}
```

- 응답: JSON 배열 (구 `sise_day.naver` 는 2026-09 부터 **HTTP 410 Gone**)
- 페이지당 **60영업일**. `pageSize` 가 100 이면 빈 응답이 온다 (`NAVER_PAGE_SIZE = 60`)

#### 응답 필드 → `t_stock_amt` 매핑

| JSON 필드 | 예시 | 저장 컬럼 | 비고 |
|-----------|------|-----------|------|
| `localTradedAt` | `"2026-09-21"` | `e_date` | 거래일. 이미 `YYYY-MM-DD` 라 변환 불필요 |
| `closePrice` | `"275,000"` | `e_amt` | 종가. 콤마 제거 |
| `compareToPreviousClosePrice` | `"14,000"` / `"-11,000"` | `c_amt` | 전일대비. **값에 부호 포함** |
| `accumulatedTradingVolume` | `33876593` | `e_trade` | 거래량 (숫자형) |
| `fluctuationsRatio` | `"5.36"` / `"-4.24"` | — | **쓰지 않음**. `e_rate` 는 직접 계산 |
| `compareToPreviousPrice.code` | `2`=상승 `3`=보합 `5`=하락 | — | 부호가 값에 있어 쓸 일이 없다 |

`e_rate` 는 기존 데이터와 기준을 맞추려 직접 계산한다.

```typescript
const prevClose = close - e_amt
const e_rate    = prevClose > 0 ? Math.round(e_amt / prevClose * 10000) / 100 : 0
```

삼성전자·`498400`·`069500` 180행 대조 결과 `fluctuationsRatio` 와 **차이 0건** —
전환 시점에 값이 튀지 않는다.

**대안으로 쓰지 않는 API** — `api.stock.naver.com/chart/domestic/item/{code}/day` 는
전일대비·등락률 필드가 없고 당일 거래량이 어긋난다.

### 수집 흐름 (`fetchAndSaveNaverPrices`)

1. 오늘 날짜(`todayStr`) `t_stock_amt` 레코드 삭제 (당일 재수집)
2. `MAX(e_date)` 조회 → `maxDateStr`
3. `maxPage` = `maxDateStr` 있으면 `2`(120영업일), 없으면 `5`(300영업일)
4. 3페이지씩 병렬 요청(배치) → `maxDateStr` 도달 시 수집 중단
5. 중복 날짜 제거 (Set 기반)
6. `t_stock_amt` UPSERT (`ON CONFLICT (e_date, stock_code) DO UPDATE`)
7. INSERT 컬럼: `(e_date, stock_code, e_amt, c_amt, e_rate, e_trade, finish_yn)` (stock_type 제외)

`scripts/sync-stock-prices.mjs` 는 `--resync-days N` 구간을 덮도록
`maxPage = Math.max(2, Math.ceil(resyncDays / 60))` 로 넓힌다.

### JSON 파싱 (`_parseSiseDay`)

- 배열이 아니면 빈 배열 반환 (에러 응답 방어)
- `localTradedAt` 이 `YYYY-MM-DD` 정규식에 맞지 않으면 그 행 건너뜀
- 콤마 제거 후 숫자 변환은 `_num()` 헬퍼 하나로 처리
- 종가가 0/NaN 이면 그 행 건너뜀

### 요청 헤더

```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
Referer: https://m.stock.naver.com/domestic/stock/{종목코드}/total
Accept: application/json
Accept-Language: ko-KR,ko;q=0.9
```

### 같은 로직이 복제된 3곳

수집 코드를 고칠 때 **세 파일을 함께** 고쳐야 한다.

| 파일 | 함수 |
|------|------|
| `app/assets/stock/actions.ts` | `_fetchSisePage` / `_parseSiseDay` |
| `app/api/cron/stock-sync/route.ts` | `fetchSisePage` |
| `scripts/sync-stock-prices.mjs` | `fetchSisePage` |

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
| `showModal` | `boolean` | 매입/매도 모달 표시 여부 |
| `form` | `FormState` | 모달 입력 폼 상태 (`fund_type` 포함) |
| `editTxId` | `number \| null` | 수정 중인 거래 id. `null` 이면 추가 모드 |
| `modalTransactions` | `StockTransaction[]` | `transactions` 를 `form.account_no` 로 거른 값 (useMemo). 모달 하단 목록 전용 |
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

### 현금 기준 매입금액 (`total_buy_amount_cash`)

`getHoldings()` 가 계좌+종목 단위로 계산한다. 매도가 섞여도 `total_buy_amount` 와 기준이 같도록
**매입액 비중을 그대로 곱하는 잔고 비례 방식**을 쓴다.

```sql
-- getHoldings() 집계 컬럼
SUM(CASE WHEN ms.qty > 0 THEN ms.qty * ms.s_amt ELSE 0 END)                          AS gross_buy_amt
SUM(CASE WHEN ms.qty > 0 AND ms.fund_type = 1 THEN ms.qty * ms.s_amt ELSE 0 END)     AS cash_buy_amt
```

```typescript
// TypeScript 쪽 환산
const cash_ratio = gross_buy_amt > 0 ? cash_buy_amt / gross_buy_amt : 1
total_buy_amount_cash = Math.round(total_buy_amount * cash_ratio)
```

화면 합계 카드:

```typescript
const totalBuy      = Σ r.total_buy_amount
const totalBuyCash  = Σ r.total_buy_amount_cash
const totalEval     = Σ r.evalAmt
const totalPnl      = totalEval - totalBuy
const totalRate     = totalBuy     > 0 ? totalPnl     / totalBuy     * 100 : null
const totalPnlCash  = totalEval - totalBuyCash
const totalRateCash = totalBuyCash > 0 ? totalPnlCash / totalBuyCash * 100 : null
```

- 보유 종목이 전부 현금 매입이면 `totalBuyCash === totalBuy` 라 두 손익 카드 값이 같다
- 분배금 재투자가 섞이면 현금 기준 원금이 작아져 **현금 수익률이 더 높게** 나온다

### 배당 팝업 계산

요약 카드(추정치)와 지급 이력 테이블(실적치)은 **수량 기준이 다르다**. 섞으면 안 된다.

```typescript
// 월평균 분배율 — 최근 12개월 (분배가 월 1회라 divHistory 최근 12건 = 12개월)
const avgWindow = divHistory.slice(0, 12)
const avgRate   = avgWindow.reduce((s, r) => s + r.dist_rate, 0) / avgWindow.length

// 요약 카드 "내 잔고 기준 이번 달 분배금" — 지금 시점의 잔고 기준 추정치
const curHoldings = holdings.filter(h => h.stock_code === DIV_STOCK_CODE && h.net_qty > 0)
const div = Math.round(h.net_qty * (h.latest_price ?? 0) * avgRate / 100)
const tax = Math.round(h.net_qty * (latest?.tax_base_amt ?? 0))

// 지급 이력 테이블 우측 2개 열 — 13일 기산 실적치
const rowQty   = Σ acctDivIdx.get(`${ref_date}|${account_no}`)?.qty_13th     // 보유 잔고
const rowTotal = Σ acctDivIdx.get(`${ref_date}|${account_no}`)?.dist_total   // 합계
```

| | 수량 출처 | 성격 |
|---|---|---|
| 요약 카드 | `getHoldings()` 의 `net_qty` (현재) | 추정 |
| 지급 이력 테이블 | `getMonthlyDividendByAccount()` 의 `qty_13th` (13일 기산) | 실적 |

### 종목 검색 (모달)

- 입력 시 200ms 디바운스 후 `searchStockList(q)` 호출
- 포커스 시 빈 쿼리로 즉시 호출 → `default_yn='Y'` 인기 종목 20개 표시
- 선택 후 칩 표시, × 버튼으로 초기화
- onBlur 150ms 지연 후 드롭다운 닫기 (클릭 이벤트 처리를 위해)
