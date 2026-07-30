# 글로벌 ETF — 기술 사양

---

## 파일 구조

```
app/invest/etf/
├── page.tsx                        수집 이력 + 수동 실행 (클라이언트)
├── holdings/page.tsx               종목 주가 조회 (클라이언트)
├── analysis/
│   ├── price-rise/page.tsx         주가 상승 분석 (클라이언트)
│   └── volume-change/page.tsx      수량 변동 분석 (클라이언트)
├── recommend/page.tsx              추천 종목 (클라이언트)
├── components/
│   └── StockSeriesPanel.tsx        공통 차트+테이블 패널 (주가·비중 추이 / 종목 추세 / 날짜별 테이블)
└── actions.ts                      서버 액션 (DB 조회 + 수집 실행)

lib/
├── pension-db.ts                   DB Pool (ETF 전용 Pool 없이 이걸 그대로 사용)
└── etf-collector.ts                Python 수집기 프로세스 기동·상태 관리

collector/etf/                      Python 수집기 (별도)
```

---

## DB 스키마

테이블 생성 스크립트: [collector/sql/create_etf_tables.sql](../../../collector/sql/create_etf_tables.sql)

| 테이블 | 설명 |
|--------|------|
| `etf_holdings` | ETF 보유 종목 데이터 (UNIQUE: etf_ticker + holding_date + ticker) |
| `etf_fetch_log` | 수집 이력 로그 (status: success / skipped / error) |

---

## 서버 액션 (`app/invest/etf/actions.ts`)

| 함수 | 설명 |
|------|------|
| `getFetchLog()` | `etf_fetch_log` 최근 60건 조회 |
| `getDefaultTickers()` | t_stock_list.default_yn='Y' 종목 목록 (listed_shares DESC) |
| `getTickers(etf, country?)` | DISTINCT ticker + name + location 목록 |
| `getStockSeries(etf, ticker)` | 날짜별 주가(price_krw)·비중·수량·통화 시계열. price_krw = ROUND(market_value / shares * etf_holdings.fx_rate) — 수집 시점 환율 직접 사용(t_fx_rate LATERAL 불필요). weight_pct: 단일 ETF는 etf_holdings.weight_pct 원본 사용, 전체ETF는 SUM(종목 market_value) / SUM(전체 ETF NAV) × 100 |
| `getPriceRiseTop(etf, country?, days?)` | 기간 첫날/마지막날 주가 비교 → 상승률 TOP 20. days=null이면 전체 |
| `getPriceRiseSeries(etf, ticker)` | 선택 종목 날짜별 주가+보유수량 |
| `getVolumeChangeTop(etf, country?, days?)` | 수량 변동폭 TOP 20. days=null이면 전체 |
| `getVolumeChangeSeries(etf, ticker)` | 선택 종목 날짜별 수량+주가 |
| `getRecommend(etf, country?, days?)` | 비중·수량·주가 변화 기반 스코어 종목 목록 + 최근14일 변화 + full_days. days=null이면 전체 |
| `getStockEtfWeights(tickers)` | 각 ticker의 ETF별 최신 비중(weight_pct) 반환. 전체 ETF 대상, 최신 영업일 기준 |
| `getEtfSummary(days?)` | ETF별 기간 내 총 보유금액(KRW), 증감, 종목수. 국가 필터 없이 ETF 전체 집계 |
| `triggerCollect()` | Python 수집기 실행 (`lib/etf-collector.ts` 의 `startCollection()`) |
| `getCollectStatusAction()` | 실행 중 / 완료 / 오류 상태 폴링 (`getCollectStatus()` 래핑) |

### 추천 스코어링 로직

클라이언트 측 상대평가 (`computeRelativeScores` in `recommend/page.tsx`):

```
비중증가율 (0~35pt): 음수 → 0 처리 후 백분위 순위 기반
수량증가율 (0~35pt): 음수 → 0 처리 후 백분위 순위 기반
주가상승률 (0~30pt): |price_change_pct| 절댓값 기반 (모멘텀 + 저평가 동시 반영)
총점 = 세 항목 합산 (0~100pt)
```

- 최하위 종목 0pt / 최상위 종목 만점, 1점 단위
- 단일 종목 조회 시 각 항목 만점 부여

#### 시간 감쇠(Time-Decay) 모델

각 항목의 랭킹 값은 전체 기간 단순 변화 대신 **일평균 변화율의 가중 블렌딩**을 사용한다.

```
decay_value = 0.7 × (최근 14일 변화 / 14일)
            + 0.3 × (전체 기간 변화 / full_days)
```

- `full_days` = 선택 기간 내 첫 날~마지막 날 캘린더 일수 (`getRecommend` 반환)
- `recent_*_change` = 종료일 기준 14 캘린더일 이전 가장 가까운 영업일~종료일 변화 (`getRecommend` 반환)
- 최근 14일 영업일이 없는 경우(기간 < 14일) → `recent_*_change = weight_change` (전체 기간으로 대체)
- 감쇠 상수 `DECAY_ALPHA = 0.7`, `RECENT_DAYS = 14` (상수 파일 상단에 선언)

---

## DB 연결

ETF 전용 Pool은 두지 않는다. 같은 Supabase DB라 [lib/pension-db.ts](../../../lib/pension-db.ts) 의
`getPensionPool()` 을 그대로 쓴다.

```typescript
import { getPensionPool } from "@/lib/pension-db"
```

---

## 주요 컴포넌트

| 컴포넌트 | 설명 |
|----------|------|
| `CollectHistoryTable` | 수집 이력 테이블 + 수동 실행 버튼 + 실행 중 상태 |
| `TickerSearch` | 종목명/티커 자동완성 드롭다운 |
| `HoldingsChart` | 주가·비중 이중 라인 차트 |
| `RankBarChart` | TOP 20 가로 바차트 (클릭 → 상세 시계열) |
| `ScoreBadge` | 점수 뱃지 (0~39pt: 회색, 40~69pt: 파랑, 70pt+: 초록) |
| `StockSeriesPanel` | 공통 차트+테이블 패널 — 주가 추이 + 비중(%) 추이 + 종목 추세(4지표 0~100 정규화) + 날짜별 상세 테이블. holdings·price-rise·volume-change·recommend 4개 화면에서 공통 사용. `ChartPoint` 타입 export |
| 요약 테이블 패턴 | 모든 화면 공통: 5열(항목/기초/기말/변화/변동(%)), 4행(주가/비중/수량/투자금액). 상세 영역과 카드 그리드 모두 동일 구조 |
| ETF 소개 카드 패턴 | holdings·price-rise·volume-change·recommend 공통: IEMG/EEM/EWY 3열 그리드, iShares 최신 자료 보기 링크 버튼 포함 |
| ETF 요약 카드 패턴 | 4개 화면 공통: `getEtfSummary(days?)` 결과 → ETF별 보유금액·증감·분석기간·기초금액·3ETF 비중·종목당평균 3열 카드 |

## 숫자 유틸리티

모든 화면에서 `lib/fmt.ts` 공유 유틸을 사용한다.

```typescript
import { fmt, cc } from "@/lib/fmt"
// fmt(n, dec?) → 천단위 구분자 포함 문자열, null → "-"
// cc(v)        → text-red-600 / text-blue-600 / text-gray-400
```

페이지 내 로컬 `fmt` / `cc` 함수 정의 금지. 자세한 규격은 `docs/main_design.md` 참고.

---

## 수집기 실행 방식

Server Action + [lib/etf-collector.ts](../../../lib/etf-collector.ts) 로 구현돼 있다.

```typescript
// lib/etf-collector.ts — 프로세스 기동과 상태를 모듈에서 관리
export function startCollection(): { started: boolean; reason?: string }
export function getCollectStatus(): CollectStatus

// app/invest/etf/actions.ts — 화면은 서버 액션으로만 접근
triggerCollect()            // startCollection() 호출
getCollectStatusAction()    // getCollectStatus() 폴링용
```

- `spawn(pythonCmd, ["fetch_holdings.py"], { cwd: collector/etf })` 로 실행하고 종료 시 로그를 DB에 적재
- 실행 상태는 모듈 전역에 보관하므로 **서버리스(Vercel)에서는 동작하지 않는다** —
  로컬/상시 구동 환경 전용 (`instrumentation.ts` 의 스케줄도 동일한 이유로 Vercel에서 비활성)

---

## 접근 권한

| 기능 | 접근 권한 |
|------|----------|
| 화면 조회 | 전체 인증 사용자 |
| 수동 수집 실행 | `admin` 역할만 |

---

## 수집 로그 상태값

| status | 의미 |
|--------|------|
| `success` | 신규 날짜 데이터 저장 완료 |
| `skipped` | 이미 저장된 날짜 (fetched_at만 갱신) |
| `error` | 다운로드/파싱 실패 |
