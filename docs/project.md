# 연금투자 시뮬레이션 프로젝트

## 프로젝트 개요

KODEX200 ETF와 KODEX200 타겟위클리커버드콜 ETF에 장기 적립 투자 시, 퇴직 시점의 예상 평가금액·수익률·월 배당금을 연평균 수익률 시나리오별로 비교하는 웹 시뮬레이터.

---

## 1. 주요 기능

### 연금투자 시뮬레이션 (`/personal-pension/savings-fund`)

| 기능 | 설명 |
|------|------|
| 탭별 시뮬레이션 | 수익율 확인 / 동민 / 고은 / 샤인 — 대상자별 독립 파라미터 |
| 시나리오 비교 | KODEX200 연평균 -20%·-10%·0%·5%·10%·20% 6개 시나리오 |
| 입력값 수정 | 생년월일·초기입금·월납입금·적립기간·연금수령나이·커버드콜배당률 |
| 보관기간 자동 계산 | 생년월일 + 연금수령나이 → holdMonths 자동 산출 |
| 시뮬레이션 저장 | 제목·메모 포함 DB 저장, 목록 조회·비교, 기본값 복원 |
| 시뮬레이션 삭제 | 저장 목록에서 단건 삭제 |
| 헬프 모달 | 투자 기준 / 화면 기능 요약 / 화면 상세 안내 3탭 |
| 상품 헬프 팝오버 | KODEX200 ETF / 커버드콜 ETF 장단점·구성 팝오버 |

### 시뮬레이션 계산 공식

```
월 ETF 수익률:  r_etf = (1 + annual_rate)^(1/12) - 1
월 커버드콜:    r_cc  = r_etf + ccAnnualRate / 12

적립 완료 평가금액:
  FV = init × (1+r)^n + pmt × [(1+r)^n - 1] / r

보관 기간 후 평가금액:
  FV2 = FV × (1+r)^holdMonths

퇴직 후 배당금:
  연 배당 = FV2_cc × ccAnnualRate
  월 배당 = 연 배당 / 12
```

---

## 2. 데이터베이스

### 시뮬레이션 저장 DB (Supabase PostgreSQL)

> 연결 정보는 `.env.local` 의 `PENSION_SIM_DB_*` 환경 변수로 관리한다.

| 환경 변수 | 설명 |
|-----------|------|
| `PENSION_SIM_DB_HOST` | Supabase PostgreSQL 세션 풀러 호스트 |
| `PENSION_SIM_DB_PORT` | 포트 (5432) |
| `PENSION_SIM_DB_NAME` | 데이터베이스명 (postgres) |
| `PENSION_SIM_DB_USER` | 사용자명 (postgres.PROJECT_REF) |
| `PENSION_SIM_DB_PASSWORD` | 비밀번호 — 특수문자 포함 시 `"..."` 로 감싸서 저장 |

### 테이블 설계

#### `pension_sim_savings_fund`

```sql
CREATE TABLE IF NOT EXISTS pension_sim_savings_fund (
  id        SERIAL PRIMARY KEY,
  tab_id    VARCHAR(50)  NOT NULL,
  tab_label VARCHAR(50)  NOT NULL,
  saved_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  inputs    JSONB        NOT NULL,
  results   JSONB        NOT NULL,
  title     VARCHAR(200),
  memo      TEXT
);
```

#### `inputs` JSONB 구조 (InputValues)

| 필드 | 타입 | 설명 |
|------|------|------|
| `initDeposit` | number | 초기 입금 (원) |
| `monthlyPmt` | number | 월 납입금 (원) |
| `accumMonths` | number | 적립 기간 (개월) |
| `holdMonths` | number | 보관 기간 (개월, 자동 계산) |
| `ccAnnualRate` | number | 커버드콜 배당률 (소수, 예: 0.12) |
| `retirementAge` | number | 연금 수령 나이 (만 나이) |
| `birthdate` | string | 생년월일 (YYYY-MM-DD) |

#### `results` JSONB 구조 (ComputedRow[])

| 필드 | 타입 | 설명 |
|------|------|------|
| `rate` | string | 수익률 라벨 (-20% 등) |
| `kodex` | [string,string,string,string] | ETF [적립금액, 적립수익률, 퇴직금액, 퇴직수익률] |
| `covered` | [string,string,string,string] | 커버드콜 동일 구조 |
| `diff` | [string,string,string,string] | 차액 동일 구조 |
| `dividend` | [string,string] | [연배당금(만), 월배당금(만)] |

---

## 3. 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프레임워크 | Next.js 16.2.6 (App Router, Turbopack) |
| 인증 | NextAuth v5.0.0-beta.31 (Credentials Provider, JWT 세션) |
| DB 연결 | `pg` Pool 싱글턴 — Server Actions (`"use server"`) |
| 라우트 보호 | `proxy.ts` (Next.js 16 미들웨어, named export `proxy`) |
| 스타일 | Tailwind CSS |
| 언어 | TypeScript |

### 인증

- 계정 정보: `.env.local` 의 `ADMIN_USERNAME` / `ADMIN_PASSWORD`
- **주의**: `#` 포함 패스워드는 반드시 `"..."` 로 감싸야 dotenv 정상 파싱
- `/login` 이외의 모든 경로는 세션 없으면 `/login` 으로 리다이렉트

---

## 4. 화면 구성

| 경로 | 화면명 | 설명 |
|------|--------|------|
| `/` | 홈 대시보드 | 메뉴 카드 |
| `/login` | 로그인 | Credentials 로그인 |
| `/national-pension` | 국민연금 | 국민연금 시뮬레이션 |
| `/retirement-pension` | 퇴직연금 | 퇴직연금 시뮬레이션 |
| `/personal-pension` | 개인연금 | 개인연금 메뉴 |
| `/personal-pension/savings-fund` | 연금투자 시뮬레이션 | ETF 비교 시뮬레이터 (메인 기능) |
| `/personal-pension/irp` | IRP | IRP 시뮬레이션 |
| `/personal-pension/isa` | ISA | ISA 시뮬레이션 |
| `/personal-pension/compound-magic` | 복리 마법 | 복리 계산기 |
| `/senior-pension` | 노후연금 | 노후연금 시뮬레이션 |

---

## 5. 프로젝트 디렉토리 구조

```
pensions/
├── docs/
│   ├── project.md                        # 프로젝트 설계 문서 (이 파일)
│   ├── task.md                           # 단계별 태스크 체크리스트
│   └── 퇴직연금계산.xlsx                  # 원본 기획 엑셀
├── app/
│   ├── layout.tsx                        # 루트 레이아웃
│   ├── page.tsx                          # 홈 대시보드
│   ├── login/page.tsx                    # 로그인 화면
│   ├── actions/auth.ts                   # 로그인/로그아웃 Server Actions
│   ├── api/auth/[...nextauth]/route.ts   # NextAuth 라우트 핸들러
│   ├── national-pension/page.tsx
│   ├── retirement-pension/page.tsx
│   ├── senior-pension/page.tsx
│   └── personal-pension/
│       ├── page.tsx
│       ├── irp/page.tsx
│       ├── isa/page.tsx
│       ├── compound-magic/page.tsx
│       └── savings-fund/
│           ├── page.tsx                  # 연금투자 시뮬레이션 메인 (Client Component)
│           └── actions.ts               # DB Server Actions (save/load/delete)
├── components/
│   └── AppLayout.tsx                     # 공통 사이드바 레이아웃 + 로그아웃 버튼
├── lib/
│   └── db.ts                             # pg Pool 싱글턴 (일반 DB용)
├── auth.ts                               # NextAuth v5 설정
├── proxy.ts                              # 라우트 보호 미들웨어 (Next.js 16)
└── .env.local                            # 환경 변수 (git 제외)
```

---

## 6. 환경 변수 (.env.local)

| 변수 | 설명 |
|------|------|
| `DB_HOST` | 일반 DB 호스트 |
| `DB_PORT` | 일반 DB 포트 |
| `DB_NAME` | 일반 DB명 |
| `DB_USER` | 일반 DB 사용자 |
| `DB_PASSWORD` | 일반 DB 비밀번호 |
| `NEXTAUTH_SECRET` | JWT 서명 시크릿 |
| `NEXTAUTH_URL` | 앱 URL (http://localhost:3000) |
| `ADMIN_USERNAME` | 로그인 아이디 |
| `ADMIN_PASSWORD` | 로그인 비밀번호 (`"..."` 로 감싸기) |
| `PENSION_SIM_DB_HOST` | 시뮬레이션 저장 DB 호스트 (Supabase) |
| `PENSION_SIM_DB_PORT` | 시뮬레이션 저장 DB 포트 |
| `PENSION_SIM_DB_NAME` | 시뮬레이션 저장 DB명 |
| `PENSION_SIM_DB_USER` | 시뮬레이션 저장 DB 사용자 |
| `PENSION_SIM_DB_PASSWORD` | 시뮬레이션 저장 DB 비밀번호 (`"..."` 로 감싸기) |

---

## 7. 투자 상품 정보

### KODEX200 ETF (티커: 069500)
- 운용사: 삼성자산운용
- 코스피200 지수 1:1 추종 인덱스 ETF
- 주요 구성: 삼성전자(22.81%), SK하이닉스(14.86%), KODEX200(17.09%) 등
- 운용보수: 연 0.15%

### KODEX200 타겟위클리커버드콜 ETF
- 운용사: 삼성자산운용
- 기초자산: KODEX200 / 전략: 매주 콜옵션 매도
- 연 배당률: 약 15% (세후 약 12%, 운용보수 0.39% 제외)
- 배당 주기: 월배당

| 계좌 유형 | 배당소득세 |
|-----------|-----------|
| 종합계좌 (CMA) | 15.4% 사전 공제 |
| 연금저축 계좌 | 퇴직 시점 이연 (5.5% 이하) |
| 개인형 IRP | 연말정산 소득공제 (13.2%~16.5%) |
| ISA 계좌 | 200만원(서민 400만원) 비과세 / 초과분 9.9% 분리과세 |
