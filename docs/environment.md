# 기술 환경 — 연금 관리 플랫폼

## 기술 스택

| 레이어 | 기술 | 비고 |
|--------|------|------|
| 프레임워크 | Next.js 16 (App Router) | `node_modules/next/dist/docs/` 참고 필수 |
| 언어 | TypeScript | |
| 스타일 | Tailwind CSS | |
| 인증 | NextAuth v5.0.0-beta.31 | Credentials Provider, JWT 세션 |
| DB 클라이언트 | `pg` Pool 싱글턴 | Server Actions (`"use server"`) |
| 시뮬 DB | Supabase PostgreSQL | 세션 풀러 연결 |
| 번들러 | Turbopack (기본) / `--webpack` 플래그로 전환 가능 | Turbopack 첫 요청 404 이슈 시 webpack 사용 |

> **주의**: 이 프로젝트의 Next.js는 기존 버전과 breaking changes가 있다.
> 코드 작성 전 반드시 `node_modules/next/dist/docs/`의 관련 가이드를 확인할 것.

---

## 파일 구조 (주요)

```
pensions/
├── app/
│   ├── layout.tsx                        루트 레이아웃
│   ├── page.tsx                          홈 (리다이렉트)
│   ├── login/page.tsx                    로그인 화면
│   ├── register/page.tsx                 회원가입 화면
│   ├── actions/
│   │   ├── auth.ts                       로그인·로그아웃 Server Actions
│   │   ├── menus.ts                      getMyMenus() — 역할별 메뉴를 DB 에서 조회
│   │   ├── profile.ts                    개인 정보 조회 (PROFILE_* 환경 변수) — 연금 메뉴 공통
│   │   └── visitor.ts                    방문자 기록 Server Action
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts   NextAuth 라우트 핸들러
│   │   ├── cron/
│   │   │   └── stock-sync/route.ts       Vercel Cron 주가 수집 엔드포인트 (CRON_SECRET 인증)
│   │   └── stock/
│   │       ├── price/route.ts            네이버 실시간 가격 프록시 (현재 미사용)
│   │       ├── daily/route.ts            네이버 candle API 프록시 (현재 미사용)
│   │       └── search/route.ts           네이버 자동완성 프록시 (현재 미사용)
│   ├── assets/
│   │   ├── page.tsx                      /assets/stock 리다이렉트
│   │   └── stock/
│   │       ├── page.tsx                  주식 투자 (포트폴리오·차트·거래내역)
│   │       └── actions.ts               주식 CRUD + 네이버 주가 수집 Server Actions
│   │   └── shopping/
│   │       ├── upload/route.ts            첨부파일 업로드 (Supabase Storage)
│   │       └── content-image/route.ts     본문 인라인 이미지 업로드
│   ├── pension/
│   │   ├── page.tsx                      /pension/my 리다이렉트
│   │   ├── my/
│   │   │   ├── page.tsx                  나의 연금 현황 — 세 연금 합산 대시보드
│   │   │   └── actions.ts               getPensionOverview() — 국민·퇴직·개인 합산
│   │   ├── nat/
│   │   │   ├── page.tsx                  국민연금
│   │   │   └── actions.ts               국민연금 스냅샷 CRUD
│   │   ├── ret/page.tsx                  퇴직연금
│   │   └── per/
│   │       ├── page.tsx                  개인연금 (수령액 시뮬레이션 + 표별 도움말)
│   │       └── actions.ts               개인연금 설정·현황·시뮬레이션 Server Actions
│   ├── invest/
│   │   ├── page.tsx                      /invest/etf 리다이렉트
│   │   ├── etf/                          글로벌 ETF — page/holdings/recommend/analysis + actions.ts
│   │   └── usa/                          미국 경제 지표 — page/indicator/treasury/fx + actions.ts
│   ├── life/
│   │   ├── page.tsx                      /life/cost 리다이렉트
│   │   ├── cost/
│   │   │   ├── page.tsx                  생활비 관리
│   │   │   └── actions.ts               생활비·카드 마스터 Server Actions
│   │   └── power/
│   │       ├── page.tsx                  전기요금 관리 (청구·일별 사용량·요금표)
│   │       └── actions.ts               전기요금 Server Actions
│   ├── shopping/
│   │   ├── page.tsx                      쇼핑 관리 (구매·참고자료·첨부파일)
│   │   └── actions.ts                   쇼핑 CRUD + Signed URL 발급
│   ├── magic/page.tsx                    복리의 마법
│   └── sim/
│       ├── page.tsx                      연금저축펀드 시뮬레이션
│       ├── Kodex200Panel.tsx             KODEX 200 주가 사이드 패널
│       └── actions.ts                   시뮬레이션 CRUD + IP 기록 + 시세 조회
├── components/
│   ├── AppLayout.tsx                     공통 사이드바 레이아웃
│   ├── HelpModal.tsx                     공용 도움말 모달 (파란 ! 아이콘 + 탭) — H/Box/ColTable 프리미티브 포함
│   ├── RichEditor.tsx                    쇼핑 본문 리치 에디터 (TipTap)
│   └── Providers.tsx                    세션 Provider
├── lib/
│   ├── auth-db.ts                        인증 DB + 스키마 마이그레이션 (v001~v030, v027·v028 철회)
│   ├── pension-db.ts                    Supabase DB Pool 싱글턴 (전 화면 공용)
│   ├── guard.ts                          접근 통제 — requireUser / requireAdmin / guardApi
│   ├── settings.ts                       환경 변수로 관리하는 개인 설정 (PROFILE_* / PENSION_PER_* / PENSION_RET_*)
│   ├── profile.ts                        정년일 계산 등 개인 정보 헬퍼 (calcRetireDate / ageOn / ymAtAge)
│   ├── pension-per-calc.ts               개인연금 월 단위 복리 시뮬레이션 (적립·거치·수령)
│   ├── pension-ret-calc.ts               퇴직연금 계산 (퇴직소득세·시점별 퇴직금·재투자 평가액·중도인출 시나리오)
│   ├── pension-nat-calc.ts               국민연금 조기수령 시나리오 (감액·적립식 재투자)
│   ├── etf-collector.ts                  ETF Python 수집기 기동·상태 관리
│   ├── usa-collector.ts                  미국 지표·환율 수집기 기동·상태 관리
│   ├── supabase-storage.ts               Supabase Storage 업로드·Signed URL·삭제
│   ├── card-crypto.ts                    카드 민감정보 AES-256-GCM 암/복호화
│   ├── power-calc.ts                     전기요금 계산 (계절 안분 일할계산·누진·복지할인)
│   └── fmt.ts                            공유 숫자 유틸 — fmt / cc / fmtKRW / fmtShares
├── auth.ts                               NextAuth v5 설정
├── middleware.ts                         라우트 보호 미들웨어
├── instrumentation.ts                    수집 스케줄 등록 (Vercel에서는 비활성)
├── collector/                            Python 수집기 (etf / usa)
├── scripts/
│   ├── sync-stock-prices.mjs             독립 실행 주가 수집 스크립트 (Node.js)
│   ├── run-sql.mjs                       SQL 파일 실행
│   └── check-tables.mjs                  테이블 점검
├── vercel.json                           Vercel Cron 스케줄 + 보안 헤더(CSP)
└── config/.env                           환경 변수 (git 제외 — next.config.ts 가 로드)
```

> 환경 변수 파일은 `config/.env` 다. [next.config.ts](../next.config.ts) 가 `dotenv` 로 읽어
> `process.env` 에 주입하며 **서버 기동 시 한 번만** 로드한다 — 값을 바꾸면 dev 서버를 재시작해야 한다.

---

## 공용 도움말 (`components/HelpModal.tsx`)

화면·카드 옆의 `!` 아이콘을 눌러 여는 설명 모달. 개인연금·퇴직연금이 함께 쓴다.

```tsx
import HelpModal, { H, Box, ColTable } from "@/components/HelpModal"

<HelpModal
  variant="page"            // "page" 24px(페이지 제목) | "section" 16px(카드·표 제목, 기본)
  title="퇴직연금 계산 안내"
  lead="이 화면의 숫자가 어떤 전제로 계산되는지"
  tabs={[{ key: "basis", label: "계산 전제", body: <Box><H>…</H></Box> }]}
/>
```

- **아이콘은 파란 `!` 원 하나로 통일**한다. 크기만 위치에 따라 다르다
- `tabs` 가 1개면 탭 버튼 줄을 그리지 않는다
- 본문 프리미티브
  - `H` — 박스 안 소제목
  - `Box` — 배경 박스 (`gray` / `amber` / `blue` / `emerald` / `red`)
  - `ColTable` — 컬럼명 ↔ 뜻을 1:1로 보여주는 표. `[["컬럼", <>설명</>], …]`
- 모달은 `createPortal` 로 `document.body` 에 그린다 — `<p>` 안에 놓아도 안전하다

---

## 인증

### 구조

- NextAuth v5 — **Google OAuth + Credentials** 두 Provider
- JWT 세션 (`strategy: "jwt"`, `maxAge` 30일): 사용자명(name), 역할(role), 로그인 시각이 JWT에 담긴다
- **메뉴는 JWT 에 담지 않는다.** `AppLayout` 이 마운트 시
  [app/actions/menus.ts](../app/actions/menus.ts) `getMyMenus()` 로 DB 에서 읽는다
- DB 기반 사용자·메뉴 관리 (`lib/auth-db.ts`) — 로그인 시 `ensureMigrations()` 가 실행돼
  스키마 마이그레이션이 적용된다

### 역할(role)

| role | 접근 범위 |
|------|-----------|
| `admin` | 전체 메뉴 |
| `normal` | **연금투자 시뮬레이션(`/sim`)·복리의 마법(`/magic`) 만** |

Google 계정만 있으면 누구나 `/register` 에서 즉시 `normal` 로 가입된다(승인 절차 없음).
그래서 `normal` 은 개인 데이터가 없는 두 화면으로만 제한한다.

### 접근 통제는 3중이다

메뉴를 숨기는 것만으로는 막히지 않는다. **서버 액션은 POST 엔드포인트라 화면 없이도 호출되고,
API 라우트는 미들웨어 matcher(`/((?!api|...))`)에서 아예 제외**돼 있다.
그래서 데이터에 닿는 지점마다 다시 확인한다.

| 계층 | 위치 | 내용 |
|------|------|------|
| 1. 화면 경로 | [middleware.ts](../middleware.ts) | 미인증 → `/login`. admin 이 아니면 `NORMAL_ALLOWED`(`/sim`,`/magic`) 밖은 `/sim` 으로 리다이렉트 |
| 2. 서버 액션 | [lib/guard.ts](../lib/guard.ts) | 모든 액션 첫 줄에 `requireUser()` 또는 `requireAdmin()` |
| 3. API 라우트 | [lib/guard.ts](../lib/guard.ts) | `guardApi()` → 401/403 응답 |
| 4. 메뉴 노출 | `app_role_menus` | 네비게이션에 보일 메뉴 (v026에서 normal 은 2개) |

> 메뉴를 숨길 때는 `app_menus` 행을 지우지 말고 **`app_role_menus` 에서 권한만 회수**한다.
> 나중에 되살릴 때 행을 다시 만들 필요가 없다 — `자산(assets)` 이 그렇게 숨겨져 있다 (v030).
> 화면 경로 자체는 `middleware.ts` 가 막는 게 아니라 서버 액션 가드가 막는다는 점에 주의.

### 메뉴는 세션이 아니라 DB 에서 읽는다

예전에는 로그인 시점의 메뉴 목록을 JWT 에 복사해 두고 `session.user.menus` 로 꺼내 썼다.
그래서 **메뉴 구조를 바꿔도 기존 세션에는 반영되지 않았다** — 세션 쿠키가 30일이라
모바일처럼 로그아웃 없이 계속 쓰는 환경에서는 옛 메뉴가 오래 남았다.

지금은 `AppLayout` 이 마운트할 때마다 `getMyMenus()` 로 DB 를 읽는다.

- `app_menus` · `app_role_menus` 를 고치면 **새로고침만으로 반영**된다 (재로그인 불필요)
- JWT 에는 `name` / `role` / `loginAt` 만 남아 쿠키가 가벼워졌다
- 메뉴 로딩 중에는 네비게이션 자리에 스켈레톤을 보여준다 (`navLoading`)

### 무활동 30분 만료는 서버가 검사한다

화면의 30분 카운트다운은 클라이언트 `setTimeout` 이라 탭을 닫거나 모바일에서
백그라운드로 보내면 동작하지 않는다. 그래서 토큰의 `loginAt` 을 **서버에서 매번 검사**한다.

```typescript
// auth.config.ts
export const SESSION_IDLE_MS = 30 * 60 * 1000

export function applyIdleExpiry(token, trigger) {
  if (trigger === "update") token.loginAt = new Date().toISOString()
  return isSessionExpired(token.loginAt) ? null : token   // null → 세션 끊김
}
```

- `jwt` 콜백이 `null` 을 돌려주면 세션이 무효가 되고 미들웨어가 `/login` 으로 보낸다
- **`auth.ts` 와 `auth.config.ts` 양쪽에 적용해야 한다.** `auth.ts` 가
  `...authConfig.callbacks` 를 펼친 뒤 `jwt` 를 다시 정의해 덮어쓰기 때문이다
  (미들웨어는 `auth.config.ts`, 서버 액션·페이지는 `auth.ts` 경로를 탄다)
- 활동이 있으면 `AppLayout` 이 60초 스로틀로 `update()` 를 호출해 `loginAt` 을 갱신한다.
  **이 호출을 빼면 화면을 쓰고 있어도 로그인 30분 뒤에 끊긴다**
- 쿠키 자체의 `maxAge` 는 30일 그대로다 — 만료 판정은 `loginAt` 이 한다

액션별 가드:

| 모듈 | 가드 |
|------|------|
| `app/sim/actions.ts` | `requireUser` — normal 도 쓴다 |
| 그 외 전부 (life/cost·life/power·shopping·invest/etf·invest/usa·assets/stock·pension/nat) | `requireAdmin` |

`/api/cron/stock-sync` 만 세션 대신 `CRON_SECRET` 으로 검증한다 (Vercel Cron 이 호출).

### 라우트 보호

- `middleware.ts` (Next.js 16 미들웨어, named export) — 현재 파일명은 `middleware.ts` 다 (`proxy.ts` 아님)
- `/login`, `/register` 이외 모든 경로: 미인증 시 `/login` 리다이렉트

---

## 데이터베이스

**DB는 Supabase PostgreSQL 하나뿐이다.** 인증·연금·주식·ETF·생활비·쇼핑이 모두 같은 DB를 쓴다.

- 연결: [lib/pension-db.ts](../lib/pension-db.ts) 의 `getPensionPool()` — `pg` Pool 싱글턴,
  Supabase 세션 풀러(포트 5432). 화면별 전용 Pool은 두지 않는다
- 호출은 Server Actions (`"use server"`) 또는 API Route 안에서만
- 환경 변수: `PENSION_SIM_DB_*` (이름은 시뮬레이션 화면에서 처음 쓰던 흔적이고, 현재는 전 화면 공용)
- 스키마 관리 두 갈래
  - `lib/auth-db.ts` 의 `ensureAuthTables()` / `ensureMigrations()` — 로그인 시 실행되는 번호식 마이그레이션
  - `ensureTable()` (`app/sim/actions.ts`) — 런타임에 테이블/컬럼 자동 생성

#### `pension_sim_savings_fund` 테이블

```sql
CREATE TABLE IF NOT EXISTS pension_sim_savings_fund (
  id        SERIAL PRIMARY KEY,
  tab_id    VARCHAR(50)  NOT NULL,
  tab_label VARCHAR(50)  NOT NULL,
  title     VARCHAR(200),
  memo      TEXT,
  saved_by  VARCHAR(50),
  saved_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  inputs    JSONB        NOT NULL,
  results   JSONB        NOT NULL
);
```

#### `my_stock` 테이블 — 주식 투자 거래 원장

```sql
CREATE TABLE IF NOT EXISTS my_stock (
  id         SERIAL,
  stock_code VARCHAR(20)  NOT NULL,  -- 종목코드 (대문자)
  s_date     VARCHAR(8)   NOT NULL,  -- 거래일 YYYYMMDD
  cnt        INT          NOT NULL,  -- 1=매입, 2=매도
  stock_type INT          NOT NULL DEFAULT 1,  -- 1=주식, 2=ETF
  qty        NUMERIC      NOT NULL,
  s_amt      NUMERIC      NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

#### `t_stock_amt` 테이블 — 종목별 일별 주가

```sql
CREATE TABLE IF NOT EXISTS t_stock_amt (
  e_date     DATE         NOT NULL,  -- 기준일 (PK)
  stock_code VARCHAR(20)  NOT NULL,  -- 종목코드 (PK)
  e_amt      NUMERIC,                -- 종가 (원)
  c_amt      NUMERIC,                -- 전일대비 금액 (원)
  e_rate     NUMERIC,                -- 등락률 (%)
  e_trade    NUMERIC,                -- 거래량
  finish_yn  VARCHAR(1),             -- 수집 완료 여부 ('Y')
  stock_type VARCHAR(10),            -- 종목 구분
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (e_date, stock_code)
);
```

> `my_stock` 테이블은 `ensureStockTables()` 로 런타임 자동 생성.
> `t_stock_amt` 는 실제 스키마 기준으로 사전 생성 필요 (e_date/stock_code PK, e_amt/c_amt/e_rate/e_trade 컬럼).
> `t_stock_list` 는 별도 마스터 데이터 (사전 적재 필요).

---

## 환경 변수 (`config/.env`)

| 변수 | 설명 | 비고 |
|------|------|------|
| `AUTH_SECRET` | JWT 서명 시크릿 | NextAuth v5 규격 (`NEXTAUTH_SECRET` 아님) |
| `AUTH_URL` | 앱 URL | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID | 구글 로그인 |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 시크릿 | 구글 로그인 |
| `PENSION_SIM_DB_HOST` | Supabase 세션 풀러 호스트 | |
| `PENSION_SIM_DB_PORT` | Supabase 포트 | `5432` |
| `PENSION_SIM_DB_NAME` | Supabase DB명 | `postgres` |
| `PENSION_SIM_DB_USER` | Supabase 사용자 | `postgres.PROJECT_REF` |
| `PENSION_SIM_DB_PASSWORD` | Supabase 비밀번호 | 특수문자 포함 시 `"..."` |
| `CRON_SECRET` | Vercel Cron 엔드포인트 인증 시크릿 | `Authorization: Bearer {CRON_SECRET}` 헤더 또는 `?secret=` 파라미터로 검증 |
| `SUPABASE_URL` | Supabase 프로젝트 URL | `https://PROJECT_REF.supabase.co` (쇼핑 Storage) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서비스 롤 키 | 대시보드 > Settings > API (쇼핑 Storage 서버 사이드 업로드) |
| `CARD_ENC_KEY` | 카드 민감정보 암호화 키 (32바이트 base64) | `my_card`의 `card_no`·`cvc`·`limit_ym` AES-256-GCM 암/복호화. **분실 시 복호화 불가 — 반드시 백업** |
| `FRED_API_KEY` | FRED API 키 | Python 수집기(`collector/usa`) 전용 — Next.js 코드에서는 참조하지 않음 |
| `PROFILE_BIRTH_DATE` | 생년월일 `YYYY-MM-DD` | 연금 메뉴 공용 개인 정보 |
| `PROFILE_JOIN_DATE` | 입사일 `YYYY-MM-DD` | 퇴직연금 근속 계산 |
| `PROFILE_RETIRE_AGE` | 정년 나이 | 기본 `60` |
| `PROFILE_RETIRE_RULE` | 정년일 계산 규정 | `birthday` \| `month_end`(기본) \| `year_end` |
| `PENSION_PER_PAYOUT_AGE` | 개인연금 수령 개시 나이 | 기본 `63` |
| `PENSION_PER_MONTHLY_AMOUNT` | 개인연금 월 적립액 (원) | 기본 `500000` |
| `PENSION_PER_ACCOUNT_NO` | 개인연금 재원 계좌번호 | 기본 `201-04-931585` |
| `PENSION_PER_STOCK_CODE` | 개인연금 재원 종목코드 | 기본 `498400` |
| `PENSION_RET_MONTHLY_WAGE` | 급여명세서 지급액 계 (원/월) | 기본 `7140000` · 기본급+연장근로+식대+자가운전+통신비+간식비 |
| `PENSION_RET_ANNUAL_BONUS` | 연 상여금 (원) | 기본 `9000000` · 평균임금에 `÷12` 로 산입 |
| `PENSION_RET_ANNUAL_RAISE` | 연봉 인상 (원/년) | 기본 `2400000` |
| `PENSION_RET_RAISE_MONTH` | 인상이 반영되는 달 `1`~`12` | 기본 `5` · 범위를 벗어나면 에러 |
| `PENSION_RET_WAGE_BASE_YM` | 명세서 연월 `YYYY-MM` | 기본 `2026-08` · 인상분 기산점 |
| `PENSION_RET_WITHDRAW_DATE` | 중도인출 참고 시나리오 기준일 `YYYY-MM-DD` | **비우면 `/pension/my` 참고 카드가 사라진다** · 기본값 없음 |
| `PENSION_NAT_EARLY_YEARS` | 국민연금 조기수령 연수 `1`~`5` | **비우면 `/pension/my` 참고 카드가 사라진다** · 1년당 6% 평생 감액 |
| `PENSION_NAT_INVEST_UNTIL_AGE` | 조기수령분 ETF 적립 종료 나이 | 기본 `65` · 이 나이부터 연금을 생활비로 |

### 개인 설정을 DB 가 아니라 환경 변수로 두는 이유

`PROFILE_*` / `PENSION_PER_*` 은 원래 `my_profile`·`my_pension_per_config` 테이블이었다(v027·v028).
값이 바뀌는 일이 거의 없고 사용자도 한 명뿐이라, 테이블·마이그레이션·수정 UI 를 유지하는 것보다
환경 변수 한 줄이 낫다고 보고 철회했다.

- 읽기: [lib/settings.ts](../lib/settings.ts) — `profileFromEnv()` / `perSettingsFromEnv()`
  (서버 전용. 값이 없으면 위 표의 기본값을 쓴다)
- 노출: [app/actions/profile.ts](../app/actions/profile.ts) `getProfile()`,
  [app/pension/per/actions.ts](../app/pension/per/actions.ts) `getPerConfig()` — 둘 다 `requireAdmin()` 보호
- 수정 액션은 없다. 화면의 `적립 계획 확인` 팝업은 현재 값과 변수명만 보여주는 읽기 전용이다

> **주의**: 특수문자(`#` 등) 포함 패스워드는 반드시 `"..."` 로 감싸야 dotenv 정상 파싱.
>
> 값을 추가·수정하면 **dev 서버를 재시작**해야 반영된다 (`next.config.ts` 가 기동 시 1회만 로드).
> 서버가 뜬 뒤 추가한 키는 `process.env` 에 없어, 예컨대 카드 상세의 `[보기]` 가
> "서버에 CARD_ENC_KEY 가 없습니다" 로 실패한다.

### `CARD_ENC_KEY` 생성

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

- 구현: [lib/card-crypto.ts](../lib/card-crypto.ts) — `encryptField()` / `decryptField()` / `isEncrypted()`
- 저장 형식: `enc:v1:<iv_b64>:<tag_b64>:<cipher_b64>`
- 키를 교체하면 기존 암호문을 복호화할 수 없다. 교체 시 구 키로 복호화 → 신 키로 재암호화하는 마이그레이션이 필요하다.
- 상세: [life/cost/cost_task.md](life/cost/cost_task.md) 민감정보 암호화 절

---

## Vercel 배포

### Cron Job 설정 (`vercel.json`)

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

### 보안 헤더 / CSP (`vercel.json`)

`vercel.json` 의 `headers` 는 **Vercel 배포에서만 적용되고 `next dev` 에는 적용되지 않는다.**
그래서 CSP에 막히는 리소스는 로컬에서 멀쩡하고 배포에서만 깨진다 — 외부 호스트를 새로 쓰기 시작하면
반드시 여기 화이트리스트에 추가해야 한다.

| 지시어 | 허용 대상 | 이유 |
|--------|----------|------|
| `img-src` | `'self' data: blob:` | 인라인·로컬 이미지 |
| | `https://lh3.googleusercontent.com` | 구글 로그인 프로필 사진 |
| | `https://*.supabase.co` | 쇼핑 첨부파일(서명 URL)·본문 인라인 이미지 |
| `connect-src` | `'self' https://accounts.google.com` | 구글 인증 |
| `script-src` | `'self' 'unsafe-inline' 'unsafe-eval'` | Next.js 런타임 |

> 증상 구분: 이미지가 **깨져 보이면** CSP `img-src` 차단일 가능성이 높고(브라우저 콘솔에
> `Refused to load the image ... violates Content Security Policy` 출력),
> **목록 자체가 안 나오면** `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 누락으로
> 서명 URL 생성이 실패한 것이다.

### Cron 실행 주기

- `30 11 * * *` = UTC 11:30 = **KST 20:30** (매일 장 마감 후)
- Vercel이 자동으로 `Authorization: Bearer {CRON_SECRET}` 헤더를 주입하여 호출
- 환경 변수 `CRON_SECRET` 을 Vercel 프로젝트 설정에 등록 필요
- Hobby 플랜: 하루 1회 Cron 가능 / Pro 이상: 무제한

### 배포 시 환경 변수 등록 목록

Vercel 프로젝트 Settings > Environment Variables 에 아래 변수 등록:

| 변수 | 비고 |
|------|------|
| `AUTH_SECRET` / `AUTH_URL` | NextAuth v5 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 구글 로그인 |
| `PENSION_SIM_DB_*` | Supabase DB 연결 |
| `CRON_SECRET` | Cron 인증 시크릿 |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | 쇼핑 첨부파일 Storage |
| `CARD_ENC_KEY` | 카드 민감정보 암호화 키 — 로컬 `config/.env`와 **동일한 값**을 등록해야 기존 데이터 복호화 가능 |
| `PROFILE_*` | 생년월일·입사일·정년. 누락 시 `lib/settings.ts` 기본값으로 동작하므로 **틀린 값이 조용히 표시된다** |
| `PENSION_PER_*` | 개인연금 수령 나이·월 적립액·재원 계좌/종목. 위와 같음 |
| `PENSION_RET_*` | 퇴직금 산정 기준(급여명세서 지급액·연 상여금·인상액·인상월·명세서 연월) + 중도인출 시나리오 기준일. 위와 같음 |
| `PENSION_NAT_*` | 국민연금 조기수령 참고 시나리오. 누락되면 카드가 표시되지 않는다 |

---

## 알려진 이슈 및 주의사항

| 이슈 | 원인 | 해결책 |
|------|------|--------|
| `/api/auth/session` 첫 요청 404 | Turbopack lazy compilation | `--webpack` 플래그 사용 (`npm run dev` 에 이미 적용) |
| 패스워드 파싱 오류 | `#` 등 특수문자 | `config/.env` 에서 `"..."` 감싸기 |
| 새 환경 변수가 적용되지 않음 | `next.config.ts` 가 기동 시 1회만 dotenv 로드 | dev 서버 재시작 |
| 배포에서만 이미지·리소스가 깨짐 | `vercel.json` CSP는 배포에만 적용 | `img-src` 등 화이트리스트에 호스트 추가 |
| 수집기 수동 실행이 Vercel에서 동작하지 않음 | Python 프로세스 spawn 불가 (서버리스) | 로컬/상시 구동 환경에서 실행 (`instrumentation.ts` 도 Vercel에서 스케줄 비활성) |
