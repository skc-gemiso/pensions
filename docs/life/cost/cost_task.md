# 생활비 관리 — 기술 명세

## DB 스키마

### `my_cost_item` — 항목 마스터

```sql
CREATE TABLE my_cost_item (
    id                   SERIAL PRIMARY KEY,
    category             TEXT NOT NULL,
    -- 고정지출 | 고정이체 | 생활비 | 카드결재 | 기타수입
    sub_category         TEXT,
    -- 생활비: 건물명 (예: 푸르지오 | 효성쉐르빌 | 신곡동빌라)
    name                 TEXT NOT NULL,
    payment_method       TEXT,            -- 결제수단 (국민 자동, 현금 등)
    payment_day          INT,             -- 결제일 (1~31)
    default_amount       NUMERIC(12,0) DEFAULT 0,
    account_no           TEXT,            -- 사용자번호·계좌번호 (툴팁용)
    settlement_start_day INT,             -- 카드 정산 시작일
    settlement_end_day   INT,             -- 카드 정산 종료일
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

## 서버 액션 (`app/life/cost/actions.ts`)

| 함수 | 파라미터 | 반환 | 설명 |
|------|---------|------|------|
| `getMonthData` | `yearMonth: string` | `{ items, info, prevInfo }` | 당월+전월 my_cost_info + item JOIN |
| `getRecentMonths` | `yearMonth: string, n: number` | `Array<{ year_month, income, expense }>` | 최근 n개월 수입/지출 합계 |
| `upsertCostInfo` | `yearMonth, itemId, amount, memo` | `void` | 금액 저장/수정 (ON CONFLICT UPDATE) |
| `addCostItem` | `data: Partial<CostItem>` | `CostItem` | 항목 추가 |
| `updateCostItem` | `id, data` | `void` | 항목 수정 |
| `deactivateCostItem` | `id: number` | `void` | is_active=false |
| `copyFromPrevMonth` | `yearMonth: string` | `void` | 이전 달 복사 (default_amount 기준) |

---

## 카테고리 분류

| category | 화면 섹션 | sub_category 사용 |
|----------|----------|------------------|
| `고정지출` | 고정지출 섹션 | 없음 |
| `고정이체` | 고정이체 & 금융 섹션 | 없음 |
| `생활비` | 생활비 & 공과금 섹션 | 건물명 (탭 구분) |
| `카드결재` | 카드결재 섹션 | 없음 |
| `기타수입` | 수입 집계에 포함 | 없음 |

---

## 집계 로직

- **수입**: category = `기타수입` 합산 (고정 수입은 별도 필드 없이 항목으로 관리)
- **지출**: category IN (`고정지출`, `고정이체`, `생활비`, `카드결재`) 합산
- **잔액**: 수입 - 지출
- **TOP 3**: 당월 amount DESC 상위 3개, 전월 동일 item_id와 차이 계산
- **전월 대비 카드**: 카드별 전월 amount와 비교

---

## 메뉴 등록 (v016 마이그레이션)

```sql
INSERT INTO app_menus (id, label, href, parent_id, sort_order)
VALUES ('life-cost', '생활비', '/life/cost', 'life', 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO app_role_menus (role, menu_id)
VALUES ('admin', 'life-cost'), ('normal', 'life-cost')
ON CONFLICT DO NOTHING;
```
