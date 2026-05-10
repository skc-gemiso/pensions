# Task 목록 — 연금투자 시뮬레이션 프로젝트

> 상태: `[x]` 완료 / `[ ]` 미완료

---

## Phase 1 — 프로젝트 초기화 및 인증 ✅

- [x] T1-1. Next.js 16 프로젝트 생성 (TypeScript, Tailwind, App Router, Turbopack)
- [x] T1-2. 의존성 설치 (`pg`, `next-auth@beta`)
- [x] T1-3. `.env.local` 환경 변수 파일 구성
  - **주의**: 특수문자 포함 패스워드는 반드시 `"..."` 로 감싸야 dotenv 정상 파싱
- [x] T1-4. `auth.ts` — NextAuth v5 Credentials Provider 설정 (ADMIN_USERNAME / ADMIN_PASSWORD)
- [x] T1-5. `proxy.ts` — 라우트 보호 미들웨어 (Next.js 16: `proxy.ts`, named export `proxy`)
- [x] T1-6. `lib/db.ts` — `pg` Pool 싱글턴 (일반 DB용)
- [x] T1-7. `app/login/page.tsx` — 로그인 화면
- [x] T1-8. `components/AppLayout.tsx` — 사이드바 네비게이션 공통 레이아웃 + 로그아웃 버튼

---

## Phase 2 — 홈 대시보드 및 하위 메뉴 구조 ✅

- [x] T2-1. `app/page.tsx` — 홈 대시보드 (메뉴 카드 4종)
- [x] T2-2. `app/national-pension/page.tsx` — 국민연금 (플레이스홀더)
- [x] T2-3. `app/retirement-pension/page.tsx` — 퇴직연금 (플레이스홀더)
- [x] T2-4. `app/senior-pension/page.tsx` — 노후연금 (플레이스홀더)
- [x] T2-5. `app/personal-pension/page.tsx` — 개인연금 메뉴
- [x] T2-6. `app/personal-pension/irp/page.tsx` — IRP (플레이스홀더)
- [x] T2-7. `app/personal-pension/isa/page.tsx` — ISA (플레이스홀더)
- [x] T2-8. `app/personal-pension/compound-magic/page.tsx` — 복리 마법 (플레이스홀더)

---

## Phase 3 — 연금투자 시뮬레이션 DB ✅

- [x] T3-1. Supabase PostgreSQL 연결 구성 (`PENSION_SIM_DB_*` 환경 변수)
- [x] T3-2. `pension_sim_savings_fund` 테이블 자동 생성 (`ensureTable`)
  - 컬럼: `id, tab_id, tab_label, saved_at, inputs(JSONB), results(JSONB), title, memo`
- [x] T3-3. `saveSimulation` Server Action — 탭별 시뮬레이션 DB 저장
- [x] T3-4. `loadSimulations` Server Action — 탭별 저장 목록 조회 (최대 20건)
- [x] T3-5. `deleteSimulation` Server Action — 단건 삭제

---

## Phase 4 — 연금투자 시뮬레이션 화면 ✅

- [x] T4-1. `app/personal-pension/savings-fund/page.tsx` 기본 구조
  - 탭 4종: 수익율 확인 / 동민 / 고은 / 샤인
  - 6개 수익률 시나리오: -20% · -10% · 0% · 5% · 10% · 20%
- [x] T4-2. 시뮬레이션 계산 공식 구현
  - `r_etf = (1 + annual_rate)^(1/12) - 1`
  - `r_cc = r_etf + ccAnnualRate / 12`
  - `FV = init × (1+r)^n + pmt × [(1+r)^n - 1] / r`
  - `FV2 = FV × (1+r)^holdMonths`
- [x] T4-3. 결과 테이블 — ETF / 커버드콜 / 차액 컬럼 (적립금액·수익률·퇴직금액·수익률)
- [x] T4-4. 퇴직 후 배당금 컬럼 (1년·1개월) — `커버드콜 배당률(연)` 기준 계산
- [x] T4-5. 표 내부 모든 셀 우측 정렬 (`[&_tbody_td]:text-right`)
- [x] T4-6. 시뮬레이션 결과 숫자 폰트 크기 확대
- [x] T4-7. 수익률 값 천단위 구분자 포맷 (`toLocaleString("ko-KR")`)

---

## Phase 5 — 입력값 수정 기능 ✅

- [x] T5-1. 입력값 수정 폼 — 모달/인라인 형태, 탭별 독립 파라미터
- [x] T5-2. 입력 항목: 초기 입금·월 납입금·적립 기간·커버드콜 배당률·연금 수령 나이(만)·생년월일
- [x] T5-3. 생년월일 → 보관기간(holdMonths) 자동 계산 (`birthdateToAgeMonths`)
- [x] T5-4. 입력 파라미터 2행 그리드(grid-cols-4) 레이아웃
- [x] T5-5. 초기 입금·월 납입금 천단위 구분자 포맷 입력 (`type="text" inputMode="numeric"`)
- [x] T5-6. 입력값 유효성 검증 (`validateDraft`)
  - 초기 입금: 0 ~ 10,000,000,000원
  - 월 납입금: 0 ~ 100,000,000원
  - 연금 수령 나이: 55 ~ 80세
  - 커버드콜 배당률: 0 ~ 50%
  - 적립 기간: 1 ~ 600개월
  - 생년월일 연도: 1940 ~ 2050
  - 교차 검증: 현재 나이 < 연금 수령 나이, 보관 기간 > 0
- [x] T5-7. '초기 입금 (원)' 라벨에 부연 설명 추가

---

## Phase 6 — 시뮬레이션 저장·조회·삭제 ✅

- [x] T6-1. 제목·메모 포함 시뮬레이션 저장 다이얼로그
- [x] T6-2. 저장 목록 조회 — 날짜시간 + 제목(최대 10자) 표시
- [x] T6-3. 저장된 시뮬레이션 선택 시 파라미터 복원
- [x] T6-4. '기본값으로 저장' 버튼 — 선택 시뮬레이션의 inputs를 현재 탭 기본값으로 설정
- [x] T6-5. 단건 삭제 기능 (삭제 버튼 + 확인)

---

## Phase 7 — UI/UX 개선 ✅

- [x] T7-1. `HelpPopover` 컴포넌트 — `createPortal` 고정 위치, overflow 클리핑 방지
  - KODEX200 ETF 팝오버: 구성종목·장단점·공식 링크
  - KODEX200 타겟위클리커버드콜 ETF 팝오버: 전략·장단점·공식 링크
- [x] T7-2. `PageHelpModal` 컴포넌트 — 3탭 구성
  - '투자 기준' (기본 선택): 연금 수령 나이 기준·월 배당 재투자 정책·세금 처리
  - '화면 기능 요약': 탭·입력·저장·삭제 기능 요약
  - '화면 상세 안내': 각 컬럼 및 계산 방식 상세 설명
- [x] T7-3. 페이지 제목 '연금투자 시뮬레이션' 우측 헬프 아이콘 연동
- [x] T7-4. 헬프 모달 탭 순서: 투자 기준 → 화면 기능 요약 → 화면 상세 안내

---

## Phase 8 — 배포 및 운영 ⬜

- [ ] T8-1. GitHub 저장소에 전체 코드 푸시
- [ ] T8-2. Vercel 프로젝트 생성, GitHub 연동, 환경 변수 등록
  - `PENSION_SIM_DB_*`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- [ ] T8-3. Vercel 첫 배포 및 빌드 성공 확인
- [ ] T8-4. 전체 E2E 확인 (로그인 → 시뮬레이션 → 저장 → 조회 → 삭제)

---

## 완료 기준

| # | 항목 | 상태 |
|---|------|------|
| 1 | NextAuth 로그인 인증 동작 | ✅ |
| 2 | Supabase DB 연결 및 테이블 자동 생성 | ✅ |
| 3 | 탭별 독립 파라미터 시뮬레이션 | ✅ |
| 4 | 6개 수익률 시나리오 결과 테이블 | ✅ |
| 5 | 시뮬레이션 저장·조회·삭제 | ✅ |
| 6 | 입력값 유효성 검증 | ✅ |
| 7 | HelpPopover + PageHelpModal | ✅ |
| 8 | Vercel 배포 성공 | ⬜ |
