# 변경 이력 (Changelog)

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
