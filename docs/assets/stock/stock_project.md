# 주식 투자 — 프로젝트 개요

## 경로

`/assets/stock`

`/assets` 진입 시 `/assets/stock` 으로 자동 리다이렉트 (`app/assets/page.tsx`).

---

## 접근 권한

**admin 전용** — `v015_add_stock_menu` 마이그레이션으로 `app_role_menus` 에 `(admin, stock)` 등록.

---

## 화면 구조

### 헤더 영역

- 제목: "주식 투자" / 부제: "실시간 평가 현황 및 거래 내역 관리"
- **+ 매입/매도 내역 추가** 버튼 → 모달 오픈

### 탭 구성

| 탭 ID | 탭 이름 | 내용 |
|-------|---------|------|
| `portfolio` | 포트폴리오 | 요약 카드 + 보유 종목 테이블 + 선택 종목 주가 차트 |
| `history` | 거래 내역 | 전체 거래 내역 테이블 |

---

## 포트폴리오 탭

### 요약 카드 (3개)

| 카드 | 내용 |
|------|------|
| 총 매입금액 | 보유 잔고 × 평균매입가 합계 |
| 총 평가금액 | 보유 잔고 × 현재가(`t_stock_amt` 최신값) 합계 |
| 총 평가손익 / 수익률 | 평가금액 − 매입금액, 수익률(%) |

### 보유 종목 테이블

- 컬럼: 종목코드 / 종목명 / 구분(주식·ETF) / 잔고 / 평균매입가 / 현재가(전일대비) / 매입금액 / 평가금액 / 평가손익 / 수익률
- 평가금액 큰 순으로 정렬
- 행 클릭 → 해당 종목 일별 주가 차트 표시 (토글)
- 행 호버 → 종목별 매입 내역 툴팁 (매입일 / 수량 / 매입가 / 현재가 / 수익률)
- **네이버 주가 가져오기** 버튼: `t_stock_list default_yn='Y'` 전체 종목 대상 `sise_day.naver` 증분 수집 → `t_stock_amt` 저장
- **네이버 금융 →** 링크: 선택 종목 네이버 금융 페이지 새 탭 오픈
- 코스피·코스닥 지수 실시간 조회 결과를 헤더에 표시

### 일별 주가 차트 (종목 선택 시)

- Recharts LineChart — `t_stock_amt` 종가 데이터 사용
- 기간 필터: 1개월 / 3개월 / 6개월 / 1년 / 전체
- 평균가 기준선(ReferenceLine) 표시
- 차트 하단 일자별 주가 테이블 (날짜 / 종가 / 전일대비 / 등락률, 최대 높이 480px 스크롤)

---

## 거래 내역 탭

- 컬럼: 일자 / 종목코드 / 종목명 / 구분(매입·매도) / 수량 / 단가 / 금액 / 삭제
- 날짜 역순 정렬 (최신 거래 상단)
- 삭제 버튼 → `confirm` 후 `my_stock` 레코드 삭제

---

## 매입/매도 추가 모달

| 입력 항목 | 설명 |
|-----------|------|
| 구분 | 매입(1) / 매도(2) 버튼 선택 |
| 종목 유형 | 주식(1) / ETF(2) 버튼 선택 |
| 일자 | `<input type="date">` 달력 선택 (기본값: 오늘) |
| 종목 | `t_stock_list` DB 검색 (200ms 디바운스). 빈 값 입력 시 `default_yn='Y'` 인기 종목 최대 20개 표시. 선택 후 칩 표시 |
| 단가 | 숫자 입력 (원) |
| 수량 | 숫자 입력 (주) |
| 총 금액 미리보기 | 단가 × 수량 실시간 표시 |

- 저장 → `my_stock` INSERT 후 보유 종목·거래 내역 재조회
- 취소 → 폼 초기화

---

## 핵심 기능

### 주가 자동 수집 (Naver sise_day.naver HTML 파싱)

- `finance.naver.com/item/sise_day.naver` HTML을 EUC-KR 디코딩 후 파싱
- 당일 데이터 재수집을 위해 오늘 날짜 레코드를 먼저 삭제 후 수집
- 기존 데이터 있으면 최근 6페이지(약 60영업일), 없으면 마지막 페이지까지 전체 수집 (페이지 수 고정 30 제한 없음)
- 3페이지씩 병렬 요청(배치) → 기존 최신 저장일 도달 시 수집 중단 (증분 방식)
- 수집 대상: `t_stock_list default_yn='Y'` 전체 종목 (기존: `my_stock` 보유 종목만)
- 전일비 부호 감지: `em` 태그 class `bu_pdn`=하락, `bu_pup`=상승 (기존: dn.gif/up.gif 이미지)
- `t_stock_amt(e_date, stock_code)` PRIMARY KEY 기준 UPSERT

### 시장 지수 조회

- `m.stock.naver.com/api/index/{KOSPI|KOSDAQ}/basic` API 호출
- 코스피·코스닥 현재가·등락·등락률 실시간 조회

### 스케줄 자동 실행

- Vercel Cron: 매일 11:30 UTC (한국 시간 20:30 KST)
- 엔드포인트: `GET /api/cron/stock-sync`
- `Authorization: Bearer {CRON_SECRET}` 또는 `?secret={CRON_SECRET}` 파라미터로 인증
- `t_stock_list default_yn='Y'` 전체 종목 자동 수집 (기존: `my_stock` 보유 잔고 종목만)

### 현재가 기준

- 현재가는 `t_stock_amt` 테이블의 최신 저장가(`latest_price`) 기반
- 전일 종가(`prev_price`)는 `t_stock_amt` 역순 정렬 2번째 레코드

---

## DB 테이블

| 테이블 | 용도 |
|--------|------|
| `my_stock` | 매입/매도 거래 내역 (원장) |
| `t_stock_amt` | 종목별 일별 주가 히스토리 |
| `t_stock_list` | 종목 검색용 마스터 데이터 |

---

## 참고 파일

| 파일 | 역할 |
|------|------|
| `app/assets/stock/page.tsx` | 포트폴리오 UI (클라이언트 컴포넌트) |
| `app/assets/stock/actions.ts` | DB CRUD + 네이버 주가 수집 서버 액션 |
| `app/assets/page.tsx` | `/assets/stock` 리다이렉트 |
| `app/api/cron/stock-sync/route.ts` | Vercel Cron 주가 수집 엔드포인트 |
| `app/api/stock/price/route.ts` | 네이버 실시간 가격 프록시 (현재 미사용) |
| `app/api/stock/daily/route.ts` | 네이버 candle API 프록시 (현재 미사용) |
| `app/api/stock/search/route.ts` | 네이버 자동완성 프록시 (현재 미사용) |
| `scripts/sync-stock-prices.mjs` | 독립 실행 주가 수집 스크립트 |
| `vercel.json` | Vercel Cron 스케줄 설정 |
| `lib/auth-db.ts` | `v015_add_stock_menu` 마이그레이션 |

---

## 변경 이력

| 버전 | 내용 |
|------|------|
| 최초 구현 | 포트폴리오 현황 + 일별 차트 + 매입/매도 모달 + 거래 내역 (신규) |
| 리팩터 | 현재가를 `t_stock_amt` 저장 가격 기반으로 변경 (네이버 실시간 API 제거) |
| 종목 검색 | `t_stock_list` DB 기반으로 교체 (Naver 자동완성 API 제거) |
| 일자 입력 | 매입/매도 모달 일자 달력(`<input type="date">`) 적용 |
| 차트 하단 테이블 | 일자별 주가 테이블 추가 (날짜·종가·전일대비·등락률) |
| 2026-05 | t_stock_amt 스키마 변경 (e_date/e_amt/c_amt/e_rate 컬럼 구조 확정) |
| 2026-05 | 수집 대상: my_stock 보유 종목 → t_stock_list default_yn='Y' 전체 종목 |
| 2026-05 | 네이버 파서 전일비 감지 방식 변경: dn.gif/up.gif → em class bu_pdn/bu_pup |
| 2026-05 | 전체 수집 페이지 한계: 30페이지 고정 → 마지막 페이지까지 전체 수집 |
