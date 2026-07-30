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

### `card_id` 의 두 가지 의미

`my_cost_item.card_id` 는 `item_type1` 에 따라 뜻이 갈린다. 두 집합은 서로 배타적이라 컬럼 하나로 처리한다.

| 대상 | `card_id` 의 뜻 | 입력 위치 |
|------|----------------|-----------|
| `item_type1 = '4'` (신용카드 항목) | **이 항목이 곧 그 카드** — 카드 청구액 원장 | 항목 모달의 "연결 카드" 필드 |
| 그 외 카테고리 + `cost_type = '2'` | **이 항목을 결제하는 카드** | 항목 모달의 "결제수단" 드롭다운 |

**판정은 `item_type1` 우선**이다. `item_type1='4'` 이면 언제나 "자기 자신"으로 본다.

이 때문에 조회 시 카드명으로 항목명을 대체하는 것은 `item_type1='4'` 일 때뿐이다.
조건 없이 `COALESCE` 하면 '전기 요금'에 카드를 연결한 순간 항목명이 카드명으로 덮인다.

```sql
CASE WHEN i.item_type1 = '4' THEN COALESCE(cd.card_nm, i.item_nm)
     ELSE i.item_nm END AS item_nm
```

### 결제수단 입력 — 통합 드롭다운

`cost_type`(현금/카드)과 `card_id`(어느 카드)를 화면에서는 **드롭다운 하나**로 받는다.
두 필드를 따로 받으면 "카드인데 카드 미선택" 같은 불일치가 생기지만, 통합하면 구조적으로 불가능해진다.

| 선택값 (select value) | 표시 | `cost_type` | `card_id` |
|----------------------|------|-------------|-----------|
| `""` | `-` | `null` | `null` |
| `"cash"` | 현금 | `'1'` | `null` |
| `"card:<id>"` | 카드명 (my_card 목록) | `'2'` | `<id>` |
| `"card"` | 카드(미지정) | `'2'` | `null` |

- `"card"`(미지정)은 어느 카드인지 모르는 기존 데이터를 위한 퇴로다.
- `item_type1='4'` 항목은 카드 대금이 계좌에서 빠지므로 결제수단이 `현금`이다.
  이 카테고리에서는 드롭다운에 **카드 목록을 노출하지 않고**(현금/카드(미지정)만),
  카드 연결은 별도 "연결 카드" 필드로 받는다.
- `cost_type` 은 화면의 카드/현금 지출 합계와 배지에 쓰이므로, 드롭다운을 합쳤다고 해서
  `cost_type` 에 카드 id 를 넣지 않는다. 저장은 두 컬럼 그대로다.

카드 관련 표시 값의 출처:

| 표시 항목 | 출처 |
|-----------|------|
| 카드명 (신용카드 항목) | `my_card.card_nm` — 위 `CASE` 식으로 `item_nm` 대체 |
| 결제수단 (그 외 항목) | `cost_type='2'` 이면 연결된 `my_card.card_nm`, 없으면 "카드" |
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
| `deleteCostItem` | `id: number` | `void` | 항목 마스터 **완전 삭제**. 아래 주의 참고 |
| `copyFromPrevMonth` | `yearMonth: string` | `void` | 이전 달 복사 (없는 항목은 `my_cost_item.amt` 기준 생성) |
| `copyFromMonth` | `targetYyyymm, sourceYyyymm` | `void` | 대상 월 전체 삭제 후 원본 월 복사 |
| `getAllCostItems` | – | `CostItem[]` | 항목 관리 모달용 전체 목록 (비활성 포함) |
| `getAvailableCostItems` | `yyyymm, item_type1` | `CostItem[]` | 해당 월에 아직 없는 항목 |
| `addCostInfoItems` | `yyyymm, itemIds` | `void` | 선택 항목을 해당 월에 생성 |

### 항목 삭제 시 주의 — `my_cost_info` 에 FK가 없다

v016은 `my_cost_info.item_id INT NOT NULL REFERENCES my_cost_item(id)` 로 정의했지만
`CREATE TABLE IF NOT EXISTS` 라서 앱 이전에 만들어진 테이블이 그대로 남았고, 실제 걸려 있는 제약은
`my_shopping.card_item_id`(NO ACTION) 하나뿐이다.

즉 **`my_cost_item` 만 지우면 DB가 막지 않고 `my_cost_info` 가 고아 레코드로 남는다.**
화면 조회는 `JOIN my_cost_item` 이라 보이지 않을 뿐 데이터는 남으므로,
`deleteCostItem` 은 트랜잭션 안에서 다음 순서로 처리한다.

1. `my_shopping.card_item_id` 참조 건수 확인 → 1건이라도 있으면 예외를 던지고 중단 (FK가 막기도 한다)
2. `DELETE FROM my_cost_info WHERE item_id = $1`
3. `DELETE FROM my_cost_item WHERE id = $1`

`getAllCostItems` 는 삭제 확인창에 쓸 의존 건수를 함께 돌려준다 —
`info_cnt`, `first_ym`, `last_ym`, `shopping_cnt` (모두 파생값이라 새 이름 사용).

### 카드 마스터 액션 (v021 추가)

| 함수 | 파라미터 | 반환 | 설명 |
|------|---------|------|------|
| `getCards` | – | `CardMaster[]` | `my_card` 목록. 카드번호는 `card_no_last4`만, CVC·유효기간은 `has_*` 플래그만 |
| `addCard` | `data` | `void` | 카드 추가. `card_no`(PK·NOT NULL)와 `card_nm` 필수, 민감 3종은 암호화 후 저장하고 `sort` 는 `MAX+1` |
| `getCardMaster` | `cardId: number` | `CardMaster \| null` | 카드 1건 상세 (암호문은 내리지 않음) |
| `updateCardMaster` | `cardId, data` | `void` | 카드명·구분·결제일·정산기간·메모 수정. `card_no`/`cvc`/`limit_ym`이 오면 암호화 후 저장 + `card_no_last4` 갱신 |
| `revealCardSecret` | `cardId, field` | `RevealResult` | `'cvc' \| 'limit_ym' \| 'card_no'` 복호화. [보기] 클릭 시에만 호출. 프로덕션에서는 서버 액션 예외 메시지가 가려지므로 `{ok:true,value} \| {ok:false,error}` 로 원인을 돌려준다 (키 없음 / 키 불일치 / 카드 없음) |
| `linkCardToItem` | `itemId, cardId \| null` | `void` | `my_cost_item.card_id` 연결·해제 |

---

## 카테고리 분류 (`item_type1`)

| 값 | 화면 섹션 | `item_type2` 사용 |
|----|----------|------------------|
| `1` 고정지출 | 고정지출 | 없음 |
| `2` 고정이체 | 고정이체 & 금융 | 없음 |
| `3` 생활비/공과금 | 생활비 & 공과금 | 건물명 |
| `4` 신용카드 | 신용카드 | 없음 |
| `5` 수입 | 수입 집계 | 없음 |

---

## 집계 로직

### 카드 사용액은 당월 지출에서 제외한다

카드로 결제한 항목(`item_type1 <> '4' AND cost_type = '2'`)은 **다음 달 카드 청구액에 포함되어**
`item_type1='4'` 섹션으로 들어온다. 당월 지출에 그대로 더하면 같은 돈을 두 번 세게 된다.

```
당월 지출 = 현금·계좌 출금 항목 + 당월 카드 청구액(item_type1='4')
          ─ 카드 사용액(item_type1<>'4' AND cost_type='2') 은 제외
```

카드 사용액은 버리지 않고 "다음 달 청구" 참고값으로 별도 표시한다.

| 값 | 산식 |
|----|------|
| 수입 | `item_type1 = '5'` 합산 |
| 카드 사용액 (지출 제외) | `item_type1 <> '4' AND item_type1 <> '5' AND cost_type = '2'` 합산 |
| 카드 청구액 | `item_type1 = '4'` 합산 |
| 지출 | `item_type1 <> '5'` 중 **카드 사용액을 뺀** 나머지 |
| 잔액 | 수입 − 지출 |

`item_type1='4'` 항목은 카드 대금이 계좌에서 빠지므로 `cost_type='2'` 여도 제외 대상이 아니다 —
그래서 조건에 `item_type1 <> '4'` 가 함께 붙는다.

이 규칙은 **화면의 수입 대비 지출 현황과 서버의 `getRecentMonths`(최근 3개월 현황)에 동일하게** 적용한다.
한쪽만 바꾸면 같은 달의 지출이 두 곳에서 다르게 보인다.

### 그 외

- **TOP 3**: 당월 `amount` DESC 상위 3개, 전월 동일 `item_id` 와 차이 계산.
  "어디에 얼마 썼는지" 파악이 목적이라 카드 사용액도 포함한다 (지출 합계와 기준이 다름).
- **섹션 합계·카드/현금 소계**: 각 섹션 안의 단순 합이라 위 제외 규칙과 무관하다.

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
