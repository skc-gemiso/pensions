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

---

## API / 서버 액션

### `app/shopping/actions.ts`

| 함수 | 설명 |
|------|------|
| `getShoppingList(category?)` | 구매 목록 최근 30건 (category 없으면 전체) |
| `getShoppingDetail(id)` | 구매 상세 + 첨부파일 목록 |
| `addShopping(data)` | 구매 항목 추가 |
| `updateShopping(id, data)` | 구매 항목 수정 |
| `deleteShopping(id)` | 구매 항목 삭제 (첨부파일 Storage 삭제 포함) |
| `getRefList()` | 참고 자료 최근 30건 |
| `getRefDetail(id)` | 참고 자료 상세 + 첨부파일 목록 |
| `addRef(data)` | 참고 자료 추가 |
| `updateRef(id, data)` | 참고 자료 수정 |
| `deleteRef(id)` | 참고 자료 삭제 (첨부파일 Storage 삭제 포함) |
| `deleteFile(fileId)` | 첨부파일 단건 삭제 |
| `getCardItems()` | 결제수단 목록 (my_cost_item item_type1='4') |

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
