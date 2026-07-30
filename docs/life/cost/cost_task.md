# 생활비 관리 — 기술 명세

## DB 스키마

> 아래는 **실제 운영 테이블** 기준이다. (이전 문서에 적혀 있던 `category`, `name`,
> `payment_method`, `default_amount`, `settlement_start_day` 등은 구현되지 않은 설계 초안이었다.)
>
> 원장은 `my_cost_item` → `my_cost_info` 한 축뿐이고, 카드 상세 정보만 `my_card`에서 읽는다.

### `my_cost_item` — 항목 마스터

```sql
my_cost_item (
    id          SERIAL PRIMARY KEY,
    item_nm     VARCHAR,          -- 항목명
    in_out      VARCHAR DEFAULT 'I',
    cost_type   VARCHAR DEFAULT '1',   -- 결제수단 1=현금 2=카드
    cost_to     VARCHAR,
    pay_dd      VARCHAR,          -- 결제일 (1~31). item_type1='4'는 my_card.pay_ymd를 사용
    item_type1  VARCHAR NOT NULL, -- 1=고정지출 2=고정이체 3=생활비/공과금 4=신용카드 5=수입
    item_type2  VARCHAR,          -- item_type1='3'일 때 건물명
    amt         NUMERIC(12,0) DEFAULT 0,  -- 기본금액
    use_yn      VARCHAR DEFAULT 'Y',
    memo        VARCHAR,
    card_id     INT REFERENCES my_card(id),  -- ★ v021 추가분 (item_type1='4'만 사용)
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);
```

v021의 DDL 변경은 **`card_id` 컬럼 추가 1건뿐**이다. 정산 시작·종료일, 유효기간, CVC, 카드번호는
`my_cost_item`에 두지 않고 전부 `my_card`에서 가져온다.

### `my_cost_info` — 월별 실적

```sql
my_cost_info (
    id          BIGINT PRIMARY KEY DEFAULT nextval('my_cost_info_id_seq'),
    yyyymm      TEXT NOT NULL,    -- YYYY-MM
    item_id     INT  NOT NULL REFERENCES my_cost_item(id),
    amt         NUMERIC(12,0) DEFAULT 0,
    memo        TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

카드 결제금액도 이 테이블에 그대로 적재한다 — 카드용 별도 원장은 만들지 않는다.

### `my_card` — 카드 상세 마스터

앱보다 먼저 존재했던 테이블. v021에서 연결 키와 마스킹 컬럼을 추가하고 민감 컬럼을 암호화했다.

```sql
my_card (
    card_no        VARCHAR PRIMARY KEY,  -- ★ 암호화 저장 (enc:v1:...)
    id             SERIAL UNIQUE,        -- ★ v021: my_cost_item.card_id가 참조하는 연결 키
    card_no_last4  VARCHAR,              -- ★ v021: 화면 표시용 뒤 4자리 (평문)
    card_nm        VARCHAR,              -- 카드명 — 화면 표시의 기준(source of truth)
    card_type      VARCHAR DEFAULT '1',  -- 1=신용, 2=체크
    pay_ymd        VARCHAR,              -- 결제일. 체크카드는 즉시결제라 빈 값이 정상
    start_ymd      VARCHAR,              -- 정산 시작일 (신용카드만)
    end_ymd        VARCHAR,              -- 정산 종료일 (신용카드만)
    limit_ym       VARCHAR,              -- ★ 유효기간 — 암호화 저장
    cvc            VARCHAR,              -- ★ CVC — 암호화 저장
    sort           NUMERIC,
    memo           VARCHAR
);
```

### 연결 구조

카드번호 원문이 다른 테이블로 복제되지 않도록 PK(`card_no`)가 아닌 surrogate `id`로 연결한다.

```
my_cost_info.item_id     → my_cost_item.id   월별 금액 원장 (전 카테고리 공통)
my_cost_item.card_id     → my_card.id        item_type1='4' 카드 항목만
my_shopping.card_item_id → my_cost_item.id   변경 없음
```

카드 관련 표시 값의 출처:

| 표시 항목 | 출처 |
|-----------|------|
| 카드명 | `my_card.card_nm` — `COALESCE(cd.card_nm, i.item_nm) AS item_nm` |
| 결제일 | `my_card.pay_ymd` (`card_type='2'`이면 "즉시") |
| 정산기간 | `my_card.start_ymd` ~ `my_card.end_ymd` |
| 카드번호 | `my_card.card_no_last4` (뒤 4자리만, 원문은 암호화) |
| 유효기간·CVC | `my_card.limit_ym` / `cvc` — 복호화 요청 시에만 |
| 월별 결제금액 | `my_cost_info.amt` |

`my_card`에서 카드명을 고치면 생활비·쇼핑 화면에 함께 반영된다.

---

## 민감정보 암호화 (`lib/card-crypto.ts`)

`my_card`의 `card_no` · `cvc` · `limit_ym` 3개 컬럼은 **복호화 가능한 양방향 암호화**로 저장한다.

| 항목 | 내용 |
|------|------|
| 알고리즘 | AES-256-GCM (`node:crypto`, 외부 의존성 없음) |
| 키 | 환경변수 `CARD_ENC_KEY` — 32바이트 base64. **분실 시 복호화 불가** |
| 저장 형식 | `enc:v1:<iv_b64>:<tag_b64>:<cipher_b64>` — 접두사로 암호문 여부 판별 |
| 멱등성 | `encryptField()`는 이미 `enc:v1:`로 시작하는 값을 재암호화하지 않음 (재실행 안전) |
| 평문 호환 | `decryptField()`는 접두사가 없으면 그대로 반환 (레거시 값 허용) |
| 무결성 | GCM 인증 태그로 위조 감지 — 복호화 실패 시 예외 |

암호문은 DB에서 검색·정렬할 수 없다. 그래서 연결은 `id`로 하고, 목록 표시는 평문 `card_no_last4`를 쓴다.

**복호화 경로**: 서버 액션 `revealCardSecret(cardId, field)`를 명시적으로 호출할 때만 복호화한다.
목록·상세 조회(`getCardMaster`)는 암호문을 클라이언트로 내리지 않고 값 존재 여부(`has_cvc`, `has_limit_ym`)만 넘긴다.

> **주의**: CVC는 PCI-DSS상 승인 후 저장이 금지된 항목이다. 암호화 저장도 규정 위반이므로
> 개인용 앱이라는 전제에서만 유효하다. 외부 서비스로 확장할 경우 `cvc` 컬럼을 삭제해야 한다.

---

## 서버 액션 (`app/life/cost/actions.ts`)

| 함수 | 파라미터 | 반환 | 설명 |
|------|---------|------|------|
| `getMonthData` | `yearMonth: string` | `{ items, info, prevInfo }` | 당월+전월 my_cost_info + item JOIN |
| `getRecentMonths` | `yearMonth: string, n: number` | `Array<{ year_month, income, expense }>` | 최근 n개월 수입/지출 합계 |
| `upsertCostInfo` | `yearMonth, itemId, amount, memo` | `void` | 금액·메모 저장/수정 (행 [적용] 버튼에서 호출, UPDATE 후 0건이면 INSERT) |
| `deleteCostInfo` | `yyyymm, itemId` | `void` | 해당 월 실적 1행 DELETE (항목 마스터는 유지) |
| `addCostItem` | `data: Partial<CostItem>` | `void` | 항목 추가 |
| `updateCostItemFields` | `id, data` | `void` | 항목 수정 (변경된 필드만 동적 UPDATE) |
| `deactivateCostItem` / `activateCostItem` | `id: number` | `void` | `use_yn` 토글 |
| `copyFromPrevMonth` | `yearMonth: string` | `void` | 이전 달 복사 (없는 항목은 `my_cost_item.amt` 기준 생성) |
| `copyFromMonth` | `targetYyyymm, sourceYyyymm` | `void` | 대상 월 전체 삭제 후 원본 월 복사 |
| `getAllCostItems` | – | `CostItem[]` | 항목 관리 모달용 전체 목록 (비활성 포함) |
| `getAvailableCostItems` | `yyyymm, item_type1` | `CostItem[]` | 해당 월에 아직 없는 항목 |
| `addCostInfoItems` | `yyyymm, itemIds` | `void` | 선택 항목을 해당 월에 생성 |

### 카드 마스터 액션 (v021 추가)

| 함수 | 파라미터 | 반환 | 설명 |
|------|---------|------|------|
| `getCards` | – | `CardMaster[]` | `my_card` 목록. 카드번호는 `card_no_last4`만, CVC·유효기간은 `has_*` 플래그만 |
| `getCardMaster` | `cardId: number` | `CardMaster \| null` | 카드 1건 상세 (암호문은 내리지 않음) |
| `updateCardMaster` | `cardId, data` | `void` | 카드명·구분·결제일·정산기간·메모 수정. `card_no`/`cvc`/`limit_ym`이 오면 암호화 후 저장 + `card_no_last4` 갱신 |
| `revealCardSecret` | `cardId, field` | `string \| null` | `'cvc' \| 'limit_ym' \| 'card_no'` 복호화. [보기] 클릭 시에만 호출 |
| `linkCardToItem` | `itemId, cardId \| null` | `void` | `my_cost_item.card_id` 연결·해제 |

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
