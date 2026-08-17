# 변경 이력 (Changelog)

---

## 2026-07-30

### 접근 통제 강화 — v026
점검 결과 `normal` 계정이 `/sim`·`/magic` 외 화면·데이터에 접근할 수 있었다. 세 계층으로 막았다.

- **메뉴 권한** — `normal` 에서 15개 회수, `sim`·`magic` 만 남김
  (투자 ETF 5 · 미국지표 4 · 생활비 · 전기요금 등이 열려 있었다)
- **화면 경로** — `middleware.ts` 가 인증만 확인해 URL 직접 입력으로 모든 화면이 열렸다.
  admin 이 아니면 허용 목록 밖은 `/sim` 으로 리다이렉트
- **서버 액션** — 62개 중 42개에 인증 검사가 없었다(`revealCardSecret` 포함).
  `lib/guard.ts` 의 `requireUser`/`requireAdmin` 을 전 액션에 적용.
  기존 세션 확인만 있던 `assets/stock`·`pension/nat` 도 admin 확인으로 상향
- **API 라우트** — 미들웨어 matcher 가 `/api` 를 제외해 로그인조차 필요 없었다.
  `guardApi()` 로 401/403 (`shopping/upload`·`content-image`, `stock/price`·`daily`·`search`)
- admin 계정 정리 — `baramgil3@gmail.com` 삭제, admin 은 `skc` 하나

### 전기요금 관리 신규 (`/life/power`) — v023·v024·v025
- 생활 > 전기요금 메뉴 추가. 탭 3개(월별 청구 / 일별 사용량 / 요금표 관리)
- 테이블 3개 신설: `my_power_rate`(요금표 이력) · `my_power_bill`(월별 청구) · `my_power_daily`(일별 사용량)
- **요금 계산기** `lib/power-calc.ts` — DB·세션과 무관한 순수 함수
  - 계절 경계를 걸친 달은 사용량·구간상한·기본요금을 일수로 안분(한전 일할계산)
  - 안분 사용량은 정수 kWh 반올림, 마지막 구간이 나머지를 받아 합계 보존
  - **하계 기간이 항목마다 다름** — 전력량 요금 7~8월 / 복지할인 한도 6~8월
  - 복지할인 = `-min(전기요금, 일수 안분 한도)`, 부가세 반올림, 기금·청구액 10원 절사
  - **한전 고지서 2건(2026-06·2026-07) 전 항목 일치** 검증, 시트 실측치는 2026-01~07 일치
- 요금표를 적용시작일 × 계절로 이력 관리 — 검침일 기준으로 자동 선택되어 과거 청구는 불변
- 일별 사용량은 사용기간을 요일에 맞춘 **달력**으로 입력. 일평균 1.5배 초과일 자동 강조
- 사용기간은 저장하지 않고 요금월에서 유도(검침일 21일 고정, `METER_DAY` 상수)

### 주식 투자 — 분배금 추가
- 배당 수익률 팝업에 `[+ 분배금 추가]` 인라인 폼 추가 (`addEtfDividend`)
  - `t_etf_dividend` PK가 `(stock_code, ref_date)` 라 같은 지급기준일은 덮어쓰지 않고 오류 처리
  - 저장 후 지급 이력과 계좌별 분배금을 함께 재조회
- **붙여넣기 입력** — 엑셀에서 복사한 행을 폼 영역에 붙여넣으면 5개 칸으로 자동 분리
  - `26.08.14 ⇥ 26.08.19 ⇥ 1.36% ⇥ 270 ⇥ 3` 형태
  - 탭/공백 구분, `YY.MM.DD`·`YYYY-MM-DD`·`YYYY/M/D` 날짜, `%`·천단위 콤마 처리
  - 여러 행이면 첫 행만 입력하고 안내, 인식 실패한 칸은 비운 채 어떤 항목인지 표시

### 문서 현행화
- 전 문서를 코드와 대조해 갱신 — 존재하지 않는 파일 참조(`lib/etf-db.ts`, `lib/collector.ts`),
  쓰이지 않는 환경 변수(`DB_*`, `NEXTAUTH_*`), 미구현으로 적혀 있던 완료 기능, 누락된 서버 액션 정리
- `docs/life/cost/PLAN.md`·`PROGRESS.md` 삭제 — 최초 구현 세션의 일회성 산출물이고
  PLAN.md 의 DB 설계는 실제로 구현되지 않은 초안이라 현행 문서와 충돌했다.
  역할은 `cost_project.md`·`cost_task.md` 가 대체한다

### 생활비 관리 — 카드 마스터 연결 (v021·v022)
- `my_cost_item.card_id → my_card.id` 연결. 원장(`my_cost_info`)은 그대로 두고 카드명·결제일·
  정산기간을 `my_card` 에서 JOIN. 카드번호 원문 복제를 피해 PK 대신 surrogate `id` 사용
- `my_card` 의 `card_no`·`cvc`·`limit_ym` AES-256-GCM 암호화 (`lib/card-crypto.ts`, `CARD_ENC_KEY`)
  — 목록은 뒤 4자리만, 복호화는 `revealCardSecret` 명시 호출 시에만
- 카드 목록/추가/상세 모달 신설, 카드명 기준 통일 (생활비·쇼핑 공통)

### 생활비 관리 — 집계·편집
- **카드 사용액을 당월 지출에서 제외** — 다음 달 카드 청구액에 포함되므로 이중 계상이었다.
  화면과 `getRecentMonths` 에 동일 기준 적용
- 결제수단을 통합 드롭다운(현금 / 카드별 / 카드 미지정)으로 변경
- 행 ✕ 는 항목 비활성화 → **해당 월 실적만 삭제**로 변경, 항목 마스터 삭제(`deleteCostItem`) 별도 추가
- 금액·메모 인라인 편집에서 blur 자동저장 제거, `[적용]`/`[취소]` 버튼으로 확정

### 버그 수정
- 쇼핑 첨부파일 이미지가 배포에서만 깨지던 문제 — `vercel.json` CSP `img-src` 에
  `https://*.supabase.co` 누락 (`vercel.json` 헤더는 `next dev` 에 적용되지 않아 로컬은 정상이었다)
- 월 선택 드롭다운 중복 key — `Date.setMonth()` 말일 롤오버 (7/30 → 2월 없음 → 3/2)
- 카드가 아닌 항목까지 항목명이 카드명으로 덮이던 조회 버그 (5곳)

---

## 2026-06-16

### 보안
- **Vercel 보안 헤더 추가** (`vercel.json`)
  - Content-Security-Policy (CSP), X-Frame-Options: DENY, X-Content-Type-Options: nosniff
  - Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy
  - Mozilla Observatory 점수 C등급(50점) → **B+(80점)** 개선

### UI 가독성 개선
- **`text-gray-400` 전체 정비** (5개 파일)
  - 로딩 인디케이터·플레이스홀더는 유지, 나머지 전체 상향
  - 헤더·레이블 → `text-gray-600`, 데이터 셀 → `text-gray-700`, 일반 보조 텍스트 → `text-gray-500`
  - 대상: `app/sim/page.tsx`, `app/assets/stock/page.tsx`, `app/sim/Kodex200Panel.tsx`, `app/invest/usa/treasury/page.tsx`, `app/life/page.tsx`
- **배당 팝업 과세표준액** 헤더·데이터 셀 → 굵은 빨간색(`font-bold text-red-600`)

---

## 2026-06-15

### 미국 경제지표·환율·국채 수집기 — GitHub Actions 이전
- **`.github/workflows/fx-collect.yml`** 신규 생성
  - 매일 09:00 KST(00:00 UTC) 환율(FX) 자동 수집
- **`.github/workflows/usa-collect.yml`** 신규 생성
  - 매주 월요일 09:00 KST FRED 경제지표 + TIC 국채 자동 수집
- `collector/usa/config/settings.py` DB_PORT 빈 문자열 처리 (`or 5432` 패턴)
- `FRED_API_KEY` 미설정 시 FX 수집기 import KeyError 방지 (`os.environ.get()` 변경)

### 주가 재수집 스크립트 개선
- `scripts/sync-stock-prices.mjs`에 `--resync-days N` 옵션 추가
  - 지정한 일수만큼 기존 데이터 삭제 후 KRX 기준으로 재수집
  - 사용 예: `node scripts/sync-stock-prices.mjs --resync-days 3`

---

## 2026-06-14 (이전 세션)

### ETF 수집기 — GitHub Actions 이전 및 오류 수정
- **`.github/workflows/etf-collect.yml`** 신규 생성
  - 매일 09:00 KST Playwright 기반 BlackRock iShares CSV 자동 수집
- `collector/etf/parser.py`: `except Exception: pass` → `raise`로 변경 (무음 예외 제거)
- `collector/etf/fetch_holdings.py`: `error_msg` 파라미터 누락 수정 (DB 로그에 실제 오류 기록)
- `collector/etf/db.py`: DB_PORT 빈 문자열 처리 (`or 5432` 패턴)
- `instrumentation.ts`: Vercel 환경 가드 추가, 서버 재시작 시 당일 ETF 수집 누락 catch-up 로직

### 주가 수집 — NXT 제거 및 KRX 기준 복구
- `app/api/cron/stock-sync/route.ts`, `app/assets/stock/actions.ts`, `scripts/sync-stock-prices.mjs`
  - NXT(넥스트레이드) 종가 수집 로직 전면 제거
  - Naver sise_day KRX 기준 단일 소스로 통일
- `vercel.json` 크론 스케줄: `11:05 UTC(20:05 KST)` → `06:35 UTC(15:35 KST)` 변경
  - KRX 동시호가 종료(15:30) 5분 후 수집
- 전체 종목 최근 3일 데이터 KRX 기준으로 재수집 완료

---

## 수집기 현황 요약

| 수집기 | 방식 | 스케줄 | 비고 |
|--------|------|--------|------|
| ETF 보유종목 | GitHub Actions (Playwright) | 매일 09:00 KST | BlackRock iShares |
| 환율 (FX) | GitHub Actions (Python) | 매일 09:00 KST | FRED/한국은행 |
| 미국 경제지표 | GitHub Actions (Python) | 매주 월 09:00 KST | FRED API |
| 미국 국채 (TIC) | GitHub Actions (Python) | 매주 월 09:00 KST | 미국 재무부 |
| 국내 주가 | Vercel Cron (Node.js) | 매일 15:35 KST | Naver sise_day (KRX) |
