# 생활비 관리 화면 — 작업 계획서

## 1. 메뉴 위치

```
/life/cost   ← 신규
```
현재 `/life`는 "준비 중" 페이지이므로, `/life/cost`를 생활비 메뉴로 구성하고
`/life`는 `/life/cost`로 리다이렉트 처리.

---

## 2. DB 설계

### `my_cost_item` — 항목 마스터

```sql
CREATE TABLE my_cost_item (
    id                   SERIAL PRIMARY KEY,
    category             TEXT NOT NULL,   -- 고정지출 | 고정이체 | 생활비 | 카드결재 | 기타수입
    sub_category         TEXT,            -- 생활비: 푸르지오 | 효성쉐르빌 | 신곡동빌라
    name                 TEXT NOT NULL,   -- 항목명
    payment_method       TEXT,            -- 결제수단 (국민 자동, 현금 등)
    payment_day          INT,             -- 결제일 (1~31)
    default_amount       NUMERIC(12,0) DEFAULT 0,
    account_no           TEXT,            -- 사용자번호·계좌번호 (툴팁용)
    settlement_start_day INT,             -- 카드 정산 시작일 (예: 12 → 전월 12일)
    settlement_end_day   INT,             -- 카드 정산 종료일 (예: 11 → 당월 11일)
    sort_order           INT DEFAULT 0,
    is_active            BOOLEAN DEFAULT TRUE,
    created_at           TIMESTAMPTZ DEFAULT NOW()
);
```

### `my_cost_info` — 월별 실적

```sql
CREATE TABLE my_cost_info (
    id          SERIAL PRIMARY KEY,
    year_month  TEXT NOT NULL,            -- YYYY-MM
    item_id     INT NOT NULL REFERENCES my_cost_item(id),
    amount      NUMERIC(12,0) DEFAULT 0,
    memo        TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (year_month, item_id)
);
```

---

## 3. 화면 레이아웃

```
┌──────────────────────┐  ┌────────────────────────────────────────────────┐
│  월 선택: 2026.05 ▼  │  │  고정지출                          [+ 항목추가] │
│                      │  │  항목명(hover→툴팁) 날짜 결제수단 금액 메모 편집│
│  월 지출 총계         │  │  동민 사인 MG손보   05일  국민자동  34,720      │
│  ₩ 3,639,355         │  │  한화손보           25일  국민자동   4,757      │
│                      │  ├────────────────────────────────────────────────┤
│  수입 대비 지출 현황  │  │  고정이체 & 금융                   [+ 항목추가] │
│  수입   ₩   600,000  │  │  주택담보대출(4.1%)  25일  자동  1,102,095      │
│  지출   ₩ 3,639,355  │  │  퇴직제직연금        10일  자동    500,000      │
│  잔액   ₩-3,039,355🔴│  │  ...                                           │
│                      │  ├────────────────────────────────────────────────┤
│  주요 지출 TOP 3      │  │  생활비 & 공과금                   [+ 항목추가] │
│  주택담보대출이자     │  │  [푸르지오] [효성쉐르빌] [신곡동빌라]          │
│    1,102,095   ±0    │  │  전기  05일  국민카드  34,000  복지할인         │
│  퇴직제직연금         │  │  가스  20일  국민카드   8,820                  │
│      500,000  ↑+5만  │  ├────────────────────────────────────────────────┤
│  사인수학학원         │  │  카드결재                          [+ 항목추가] │
│      250,000  ↓-3만  │  │  카드사    결제금액  전월대비  정산기간   결제일 │
│                      │  │  우리카드  339,250    ↑+5만  전월12~당월11  07.10│
│  최근 3개월 현황      │  │  현대카드  133,550    ↓-2만  전월14~당월13  07.10│
│  월       수입   지출 │  │  국민카드    1,000      ±0   전월12~당월11  07.10│
│  2026.05   60만  364만│  └────────────────────────────────────────────────┘
│  2026.04   60만   ?  │
│  2026.03   60만   ?  │
└──────────────────────┘
```

---

## 4. 툴팁 상세 (항목 행 마우스 오버)

| 섹션 | 툴팁 표시 내용 |
|------|--------------|
| 고정지출 | 항목명, 결제수단, 결제일, 기본금액, 메모 |
| 고정이체 | 항목명, 결제수단, 결제일, 계좌번호(account_no), 메모 |
| 생활비 | 항목명, 사용자번호(account_no), 결제수단, 결제일, 메모 |
| 카드결재 | 카드사, 정산기간(전월 N일 ~ 당월 N일), 결제일, 전월금액, 메모 |

---

## 5. 주요 UX

| 동작 | 설명 |
|------|------|
| 월 선택 | 드롭다운 YYYY-MM, 기본값 당월 |
| 금액 수정 | 행 클릭 → 인라인 input 전환 → Enter/blur 저장 |
| 항목 추가 | [+ 항목추가] → 모달 (항목명/결제수단/결제일/금액/정산기간/메모) |
| 항목 비활성화 | 삭제 대신 is_active=false 처리 |
| 월 초기화 | 신규 월 첫 접근 시 "이전 달 복사" 버튼 → default_amount 기준 일괄 생성 |
| 잔액 색상 | 잔액 ≥ 0 → 파란색, 잔액 < 0 → 빨간색 |
| 주요 지출 TOP 3 | 당월 금액 기준 상위 3개 + 전월 대비 변동(↑/↓/±0) |
| 카드결재 전월 대비 | 카드별 전월 대비 금액 차이(↑/↓/±0) |
| 툴팁 | 모든 항목 행 hover 시 상세 정보 표시 |

---

## 6. 서버 액션 (`app/life/cost/actions.ts`)

| 함수 | 설명 |
|------|------|
| `getMonthData(yearMonth)` | 해당 월 my_cost_info + item JOIN 전체 조회 (전월 데이터 포함) |
| `getRecentMonths(yearMonth, n)` | 최근 n개월 수입/지출 합계 |
| `upsertCostInfo(yearMonth, itemId, amount, memo)` | 금액 저장/수정 |
| `addCostItem(data)` | 항목 추가 |
| `updateCostItem(id, data)` | 항목 수정 |
| `deactivateCostItem(id)` | 항목 비활성화 |
| `copyFromPrevMonth(yearMonth)` | 이전 달 기준 신규 월 초기화 |

---

## 7. 작업할 파일 목록

| 파일 | 작업 |
|------|------|
| `lib/auth-db.ts` | my_cost_item, my_cost_info 테이블 마이그레이션 추가 |
| `app/life/page.tsx` | `/life/cost` 리다이렉트로 변경 |
| `app/life/cost/page.tsx` | 신규 생성 |
| `app/life/cost/actions.ts` | 신규 생성 |
| `docs/life/cost/cost_project.md` | 신규 생성 |
| `docs/life/cost/cost_task.md` | 신규 생성 |
| `docs/main_project.md` | `/life/cost` 메뉴 항목 추가 |

---

## 8. 메뉴 등록 (auth-db 마이그레이션)

```sql
INSERT INTO menus (id, label, path, parent_id, icon, sort_order, roles)
VALUES ('life-cost', '생활비', '/life/cost', 'life', 'wallet', 1, ARRAY['admin','khj']);
```
> `life` 그룹 부모 메뉴 없으면 함께 추가 필요 — auth-db.ts 확인 후 결정
