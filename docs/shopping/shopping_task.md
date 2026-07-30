# 쇼핑 관리 — 기술 명세

## DB 스키마

### `my_shopping` — 구매 기록

```sql
CREATE TABLE my_shopping (
  id             SERIAL PRIMARY KEY,
  category       TEXT NOT NULL,          -- 'domestic' | 'overseas' | 'phone' | 'laptop'
  purchase_date  DATE NOT NULL,
  product_nm     TEXT NOT NULL,
  card_item_id   INT  REFERENCES my_cost_item(id),  -- 신용카드 항목 (my_cost_item item_type1='4')
  original_price INT,                    -- 제품가격 (원가)
  purchase_price INT,                    -- 구입가격 (실제 결제액)
  purchase_place TEXT,                   -- 구매처
  content        TEXT,                   -- 내용 (여러 줄)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `my_shopping_ref` — 참고 자료

```sql
CREATE TABLE my_shopping_ref (
  id          SERIAL PRIMARY KEY,
  category    TEXT NOT NULL,   -- 'phone' | 'laptop' | 'domestic' | 'overseas' | 'etc'
  title       TEXT NOT NULL,
  url         TEXT,            -- 참고 링크 (선택)
  content     TEXT,            -- 내용 (여러 줄)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `my_shopping_file` — 첨부파일 (구매/참고 공용)

```sql
CREATE TABLE my_shopping_file (
  id            SERIAL PRIMARY KEY,
  ref_type      TEXT NOT NULL,   -- 'shopping' | 'ref'
  ref_id        INT  NOT NULL,   -- my_shopping.id 또는 my_shopping_ref.id
  file_nm       TEXT NOT NULL,   -- 원본 파일명
  storage_path  TEXT NOT NULL,   -- Supabase Storage 경로 (버킷 내 상대 경로)
  mime_type     TEXT,
  file_size     INT,             -- bytes
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 카테고리 코드

| 코드 | 구매 목록 표시명 | 참고 자료 표시명 |
|------|-----------------|-----------------|
| `domestic` | 국내 | 국내 |
| `overseas` | 국외 | 국외 |
| `phone` | 휴대폰 | 휴대폰 |
| `laptop` | 노트북 | 노트북 |
| `etc` | — | 기타 |

---

## 결제수단

`my_cost_item WHERE item_type1 = '4'` 행을 SELECT해서 드롭다운 목록 구성.
별도 테이블 없이 생활비 관리 신용카드 섹션 재사용.

FK(`card_item_id → my_cost_item.id`)는 그대로 유지하되, **표시되는 카드명은 `my_card.card_nm` 기준**이다
(v021). `my_cost_item.card_id → my_card.id` 를 LEFT JOIN해 `COALESCE(cd.card_nm, i.item_nm)`로 조회하므로
`my_card`에서 카드명을 고치면 쇼핑 화면 드롭다운·목록에 함께 반영된다.
상세: [life/cost/cost_task.md](../life/cost/cost_task.md) 연결 구조 절.

---

## API / 서버 액션

### `app/shopping/actions.ts`

| 함수 | 설명 |
|------|------|
| `getShoppingList(category?)` | 구매 목록 최근 30건 (category 없으면 전체) |
| `getShoppingFiles(shoppingId)` | 구매 항목의 첨부파일 목록 + 각 파일의 Signed URL |
| `addShopping(data)` | 구매 항목 추가 |
| `updateShopping(id, data)` | 구매 항목 수정 |
| `deleteShopping(id)` | 구매 항목 삭제 (첨부파일 Storage 삭제 포함) |
| `getRefList()` | 참고 자료 최근 30건 |
| `getRefFiles(refId)` | 참고 자료의 첨부파일 목록 + Signed URL |
| `addRef(data)` | 참고 자료 추가 |
| `updateRef(id, data)` | 참고 자료 수정 |
| `deleteRef(id)` | 참고 자료 삭제 (첨부파일 Storage 삭제 포함) |
| `deleteShoppingFile(fileId)` | 첨부파일 단건 삭제 (Storage + DB) |
| `getCardItems()` | 결제수단 목록 (my_cost_item item_type1='4') |

상세 조회 액션은 없다 — 목록(`getShoppingList`/`getRefList`)이 필요한 필드를 모두 담아 오고,
첨부파일만 상세 화면에서 `getShoppingFiles`/`getRefFiles` 로 따로 가져온다.
Signed URL 은 조회 시점에 1시간짜리로 새로 발급된다.

### `app/api/shopping/upload/route.ts` (POST)

- `multipart/form-data` 수신 (`file`, `refType`, `refId`)
- Supabase Storage `shopping` 버킷에 업로드
- `storage_path`: `{refType}/{refId}/{uuid}.{ext}`
- `my_shopping_file` 레코드 INSERT
- 응답: `{ fileId, storage_path, public_url }`

---

## Supabase Storage

| 버킷 | 접근 | 용도 | URL 방식 |
|------|------|------|----------|
| `shopping` | Private | 첨부파일 | Signed URL (1시간) |
| `shopping-images` | **Public** | 본문 인라인 이미지 | 영구 Public URL |

> **CSP 주의**: 두 버킷 모두 `*.supabase.co` 에서 이미지를 내려받으므로
> [vercel.json](../../vercel.json) 의 `img-src` 에 `https://*.supabase.co` 가 있어야 한다.
> `vercel.json` 헤더는 배포에서만 적용돼, 빠져 있으면 **로컬은 정상인데 배포에서만 이미지가 깨진다.**
> 자세한 내용은 [environment.md](../environment.md) 보안 헤더/CSP 절.

- 클라이언트: `lib/supabase-storage.ts` (service role key 사용)
- 환경 변수:
  - `SUPABASE_URL` — `https://gpevyrmakclyxijrtbrf.supabase.co`
  - `SUPABASE_SERVICE_ROLE_KEY` — 서비스 롤 키 (Supabase 대시보드 > Settings > API)

### 인라인 이미지 흐름

1. 에디터에서 Ctrl+V (이미지 붙여넣기)
2. `POST /api/shopping/content-image` → Supabase `shopping-images` 버킷 업로드
3. Public URL 반환 → Tiptap 에디터에 `<img src="...">` 삽입
4. 저장 시 `content` 컬럼에 HTML(img 태그 포함)로 저장
5. 읽기 모드에서 `dangerouslySetInnerHTML`로 렌더링

---

## TypeScript 타입

```typescript
export type Shopping = {
  id: number
  category: string
  purchase_date: string   // 'YYYY-MM-DD'
  product_nm: string
  card_item_id: number | null
  card_item_nm: string | null  // JOIN
  original_price: number | null
  purchase_price: number | null
  purchase_place: string | null
  content: string | null
  created_at: string
  updated_at: string
}

export type ShoppingRef = {
  id: number
  category: string
  title: string
  url: string | null
  content: string | null
  created_at: string
  updated_at: string
}

export type ShoppingFile = {
  id: number
  ref_type: string
  ref_id: number
  file_nm: string
  storage_path: string
  mime_type: string | null
  file_size: number | null
  created_at: string
  signed_url?: string   // 조회 시 동적 생성
}

export type CardItem = {
  id: number
  item_nm: string
}
```

---

## 마이그레이션

`lib/auth-db.ts` v019: `my_shopping`, `my_shopping_ref`, `my_shopping_file` 테이블 생성
