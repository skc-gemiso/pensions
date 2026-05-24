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
│   ├── api/auth/[...nextauth]/route.ts   NextAuth 라우트 핸들러
│   ├── pension/
│   │   ├── page.tsx                      /pension/my 리다이렉트
│   │   ├── my/page.tsx                   나의 연금 현황 대시보드
│   │   ├── nat/
│   │   │   ├── page.tsx                  국민연금
│   │   │   └── actions.ts               국민연금 스냅샷 CRUD
│   │   ├── ret/page.tsx                  퇴직연금
│   │   ├── per/page.tsx                  개인연금 (진행 중)
│   │   └── seni/page.tsx                노령연금 (진행 중)
│   └── sim/
│       ├── page.tsx                      연금저축펀드 시뮬레이션
│       └── actions.ts                   시뮬레이션 CRUD + IP 기록
├── components/
│   ├── AppLayout.tsx                     공통 사이드바 레이아웃
│   ├── NationalPensionDashboardCard.tsx  국민연금 카드
│   ├── RetirementDashboardCard.tsx       퇴직연금 카드
│   └── Providers.tsx                    Redux/Context 제공자
├── lib/
│   ├── auth-db.ts                        인증 DB (사용자 관리)
│   ├── pension-db.ts                    연금 데이터 DB
│   ├── etf-db.ts                         ETF DB Pool (pension-db와 동일 DB)
│   └── fmt.ts                            공유 숫자 유틸 — fmt(n, dec?) / cc(v)
├── auth.ts                               NextAuth v5 설정
├── middleware.ts (또는 proxy.ts)         라우트 보호 미들웨어
└── .env.local                            환경 변수 (git 제외)
```

---

## 인증

### 구조

- NextAuth v5 Credentials Provider
- JWT 세션: 사용자명(name), 역할(role), 메뉴 권한이 JWT에 포함
- DB 기반 사용자 관리 (`lib/auth-db.ts`)

### 역할(role)

| role | 접근 범위 |
|------|-----------|
| `admin` | 전체 접근, 시뮬레이션 전체 탭 |
| `khj` | admin과 동일한 탭 접근 |
| 일반 | 공개 탭(`reference`, `irp-reference`)만 접근 |

### 라우트 보호

- `middleware.ts` (Next.js 16 미들웨어, named export)
- `/login` 이외 모든 경로: 미인증 시 `/login` 리다이렉트
- **이전 이슈**: Next.js 16에서 미들웨어 파일명이 `proxy.ts`로 변경된 버전 있음 → 현재 상태 확인 필요

---

## 데이터베이스

### 일반 DB (`lib/auth-db.ts`, `lib/pension-db.ts`)

- `pg` Pool 싱글턴 패턴
- Server Actions에서만 호출 (`"use server"`)
- 환경 변수: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

### 시뮬레이션 DB (Supabase PostgreSQL)

- 연결: Supabase 세션 풀러 (포트 5432)
- 환경 변수: `PENSION_SIM_DB_*`
- `ensureTable()`: 런타임에 테이블/컬럼 자동 생성

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

---

## 환경 변수 (`.env.local`)

| 변수 | 설명 | 비고 |
|------|------|------|
| `DB_HOST` | 일반 DB 호스트 | |
| `DB_PORT` | 일반 DB 포트 | |
| `DB_NAME` | 일반 DB명 | |
| `DB_USER` | 일반 DB 사용자 | |
| `DB_PASSWORD` | 일반 DB 비밀번호 | `#` 포함 시 `"..."` 필수 |
| `NEXTAUTH_SECRET` | JWT 서명 시크릿 | |
| `NEXTAUTH_URL` | 앱 URL | `http://localhost:3000` |
| `PENSION_SIM_DB_HOST` | Supabase 세션 풀러 호스트 | |
| `PENSION_SIM_DB_PORT` | Supabase 포트 | `5432` |
| `PENSION_SIM_DB_NAME` | Supabase DB명 | `postgres` |
| `PENSION_SIM_DB_USER` | Supabase 사용자 | `postgres.PROJECT_REF` |
| `PENSION_SIM_DB_PASSWORD` | Supabase 비밀번호 | 특수문자 포함 시 `"..."` |

> **주의**: 특수문자(`#` 등) 포함 패스워드는 반드시 `"..."` 로 감싸야 dotenv 정상 파싱.

---

## 알려진 이슈 및 주의사항

| 이슈 | 원인 | 해결책 |
|------|------|--------|
| `/api/auth/session` 첫 요청 404 | Turbopack lazy compilation | `--webpack` 플래그 사용 |
| 미들웨어 파일명 혼선 | Next.js 16 breaking change | `proxy.ts` → `middleware.ts` 명 확인 |
| 패스워드 파싱 오류 | `#` 등 특수문자 | `.env.local`에서 `"..."` 감싸기 |
