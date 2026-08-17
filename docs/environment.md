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
│   │   ├── my/page.tsx                   나의 연금 현황 대시보드
│   │   ├── nat/
│   │   │   ├── page.tsx                  국민연금
│   │   │   └── actions.ts               국민연금 스냅샷 CRUD
│   │   ├── ret/page.tsx                  퇴직연금
│   │   ├── per/page.tsx                  개인연금 (진행 중)
│   │   └── seni/page.tsx                노령연금 (진행 중)
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
│   ├── NationalPensionDashboardCard.tsx  국민연금 카드
│   ├── RetirementDashboardCard.tsx       퇴직연금 카드
│   ├── RichEditor.tsx                    쇼핑 본문 리치 에디터 (TipTap)
│   └── Providers.tsx                    세션 Provider
├── lib/
│   ├── auth-db.ts                        인증 DB + 스키마 마이그레이션 (v001~v022)
│   ├── pension-db.ts                    Supabase DB Pool 싱글턴 (전 화면 공용)
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

## 인증

### 구조

- NextAuth v5 — **Google OAuth + Credentials** 두 Provider
- JWT 세션 (`strategy: "jwt"`, `maxAge` 30일): 사용자명(name), 역할(role), 메뉴 권한이 JWT에 포함
- DB 기반 사용자·메뉴 관리 (`lib/auth-db.ts`) — 로그인 시 `ensureMigrations()` 가 실행돼
  스키마 마이그레이션(v001~v022)이 적용된다

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

---

## 알려진 이슈 및 주의사항

| 이슈 | 원인 | 해결책 |
|------|------|--------|
| `/api/auth/session` 첫 요청 404 | Turbopack lazy compilation | `--webpack` 플래그 사용 (`npm run dev` 에 이미 적용) |
| 패스워드 파싱 오류 | `#` 등 특수문자 | `config/.env` 에서 `"..."` 감싸기 |
| 새 환경 변수가 적용되지 않음 | `next.config.ts` 가 기동 시 1회만 dotenv 로드 | dev 서버 재시작 |
| 배포에서만 이미지·리소스가 깨짐 | `vercel.json` CSP는 배포에만 적용 | `img-src` 등 화이트리스트에 호스트 추가 |
| 수집기 수동 실행이 Vercel에서 동작하지 않음 | Python 프로세스 spawn 불가 (서버리스) | 로컬/상시 구동 환경에서 실행 (`instrumentation.ts` 도 Vercel에서 스케줄 비활성) |
