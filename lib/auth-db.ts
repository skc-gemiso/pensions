import { createHash } from "crypto"
import { getPensionPool } from "./pension-db"
import { decryptField, encryptField, extractLast4 } from "./card-crypto"

export type DbUser = {
  id: string
  name: string
  password_hash: string
  role: string
}

export type MenuRow = {
  id: string
  label: string
  href: string
  parent_id: string | null
  sort_order: number
}

declare global {
  // eslint-disable-next-line no-var
  var _authDbInitialized: boolean | undefined
  // eslint-disable-next-line no-var
  var _authMigrationsApplied: boolean | undefined
}

let initPromise: Promise<void> | null = null
let migrationsPromise: Promise<void> | null = null

export async function ensureAuthTables(): Promise<void> {
  if (global._authDbInitialized) return
  if (initPromise) return initPromise
  initPromise = _init().then(() => { global._authDbInitialized = true })
  return initPromise
}

async function _init(): Promise<void> {
  const pool = getPensionPool()

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id            VARCHAR(50)  PRIMARY KEY,
      name          VARCHAR(100) NOT NULL,
      password_hash VARCHAR(64)  NOT NULL,
      role          VARCHAR(50)  NOT NULL,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email VARCHAR(200) UNIQUE
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_menus (
      id         VARCHAR(50)  PRIMARY KEY,
      label      VARCHAR(100) NOT NULL,
      href       VARCHAR(200) NOT NULL,
      parent_id  VARCHAR(50)  REFERENCES app_menus(id),
      sort_order INT          NOT NULL DEFAULT 0
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_role_menus (
      role    VARCHAR(50) NOT NULL,
      menu_id VARCHAR(50) NOT NULL REFERENCES app_menus(id),
      PRIMARY KEY (role, menu_id)
    )
  `)

  // 초기 메뉴 시딩
  const { rows: mc } = await pool.query<{ c: string }>("SELECT COUNT(*) AS c FROM app_menus")
  if (parseInt(mc[0].c) === 0) {
    // 최상위 카테고리 메뉴
    await pool.query(`
      INSERT INTO app_menus (id, label, href, parent_id, sort_order) VALUES
        ('pension',            '연금',               '/pension',      NULL,       10),
        ('assets',             '자산',               '/assets',       NULL,       20),
        ('invest',             '투자',               '/invest',       NULL,       30),
        ('shopping',           '쇼핑',               '/shopping',     NULL,       40),
        ('life',               '생활',               '/life',         NULL,       50),
        ('sim',       '연금투자 시뮬레이션', '/sim',         NULL,       60),
        ('magic',     '복리의 마법',         '/magic',        NULL,       70)
    `)
    // 연금 하위 메뉴
    await pool.query(`
      INSERT INTO app_menus (id, label, href, parent_id, sort_order) VALUES
        ('home',               '나의 연금 현황',      '/pension/my',   'pension',  10),
        ('per',   '개인연금',            '/pension/per',  'pension',  20),
        ('ret', '퇴직연금',            '/pension/ret',  'pension',  30),
        ('nat',   '국민연금',            '/pension/nat',  'pension',  40)
    `)

    // admin: 전체 메뉴
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id)
      SELECT 'admin', m.id FROM app_menus m
    `)

    // normal: 연금투자 시뮬레이션 + 복리의 마법 접근 가능
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id) VALUES
        ('normal', 'sim'),
        ('normal', 'magic')
    `)
  }

}

export async function ensureMigrations(): Promise<void> {
  if (global._authMigrationsApplied) return
  if (migrationsPromise) return migrationsPromise
  migrationsPromise = _applyMigrations().then(
    () => { global._authMigrationsApplied = true },
    (err) => { migrationsPromise = null; throw err }
  )
  return migrationsPromise
}

async function _applyMigrations(): Promise<void> {
  const pool = getPensionPool()

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      name       VARCHAR(100) PRIMARY KEY,
      applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `)

  // v002: 연금투자 시뮬레이션을 노령연금 오른쪽 최상위 메뉴로 이동
  const { rows: v002 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v002_savings_fund_top_level'"
  )
  if (v002.length === 0) {
    await pool.query(
      "UPDATE app_menus SET parent_id = NULL, sort_order = 60 WHERE id = 'sim'"
    )
    await pool.query(
      "DELETE FROM app_role_menus WHERE role = 'normal' AND menu_id = 'per'"
    )
    await pool.query(
      "INSERT INTO app_migrations (name) VALUES ('v002_savings_fund_top_level')"
    )
  }

  // v003: IRP·ISA 메뉴 삭제, 복리의 마법을 연금투자 시뮬레이션 오른쪽 최상위로 이동 + 전체 공개
  const { rows: v003 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v003_restructure_personal_pension'"
  )
  if (v003.length === 0) {
    // IRP, ISA 권한 먼저 제거 후 메뉴 삭제
    await pool.query("DELETE FROM app_role_menus WHERE menu_id IN ('irp', 'isa')")
    await pool.query("DELETE FROM app_menus WHERE id IN ('irp', 'isa')")
    // 복리의 마법 → 최상위, 연금투자 시뮬레이션(sort_order 60) 오른쪽
    await pool.query(
      "UPDATE app_menus SET parent_id = NULL, sort_order = 70 WHERE id = 'magic'"
    )
    // 모든 역할에 복리의 마법 권한 부여 (admin은 이미 있으므로 충돌 무시)
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id)
      SELECT unnest(ARRAY['admin','normal']::text[]), 'magic'
      ON CONFLICT DO NOTHING
    `)
    await pool.query(
      "INSERT INTO app_migrations (name) VALUES ('v003_restructure_personal_pension')"
    )
  }

  // v005: 개인연금 href 원복 (v004 롤백)
  const { rows: v005 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v005_revert_personal_pension_href'"
  )
  if (v005.length === 0) {
    await pool.query(
      "UPDATE app_menus SET href = '/personal-pension' WHERE id = 'per'"
    )
    await pool.query(
      "INSERT INTO app_migrations (name) VALUES ('v005_revert_personal_pension_href')"
    )
  }

  // v006: 연금투자 시뮬레이션 → /sim, 복리의 마법 → /magic URL 변경
  const { rows: v006 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v006_shorten_menu_hrefs'"
  )
  if (v006.length === 0) {
    await pool.query("UPDATE app_menus SET href = '/sim'   WHERE id = 'sim'")
    await pool.query("UPDATE app_menus SET href = '/magic' WHERE id = 'magic'")
    // magic 전체 공개 (이미 v003에서 처리됐지만 누락 방지)
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id)
      SELECT unnest(ARRAY['admin','normal']::text[]), 'magic'
      ON CONFLICT DO NOTHING
    `)
    await pool.query(
      "INSERT INTO app_migrations (name) VALUES ('v006_shorten_menu_hrefs')"
    )
  }

  // v007: 최상위 카테고리(연금/자산/투자/쇼핑/생활) 추가, 연금 하위 메뉴 URL 및 구조 변경
  const { rows: v007 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v007_restructure_top_menus'"
  )
  if (v007.length === 0) {
    // 최상위 카테고리 메뉴 추가
    await pool.query(`
      INSERT INTO app_menus (id, label, href, parent_id, sort_order) VALUES
        ('pension',   '연금', '/pension',   NULL, 10),
        ('assets',    '자산', '/assets',    NULL, 20),
        ('invest',    '투자', '/invest',    NULL, 30),
        ('shopping',  '쇼핑', '/shopping',  NULL, 40),
        ('life',      '생활', '/life',      NULL, 50)
      ON CONFLICT (id) DO NOTHING
    `)
    // 기존 연금 관련 메뉴: URL 변경 + pension 하위로 이동
    await pool.query(`
      UPDATE app_menus SET href = '/pension/my',   parent_id = 'pension', sort_order = 10 WHERE id = 'home'
    `)
    await pool.query(`
      UPDATE app_menus SET href = '/pension/per',  parent_id = 'pension', sort_order = 20 WHERE id = 'per'
    `)
    await pool.query(`
      UPDATE app_menus SET href = '/pension/ret',  parent_id = 'pension', sort_order = 30 WHERE id = 'ret'
    `)
    await pool.query(`
      UPDATE app_menus SET href = '/pension/nat',  parent_id = 'pension', sort_order = 40 WHERE id = 'nat'
    `)
    await pool.query(`
      UPDATE app_menus SET href = '/pension/seni', parent_id = 'pension', sort_order = 50 WHERE id = 'seni'
    `)
    // sim, magic sort_order 유지 (60, 70)
    await pool.query(`
      UPDATE app_menus SET sort_order = 60 WHERE id = 'sim'
    `)
    await pool.query(`
      UPDATE app_menus SET sort_order = 70 WHERE id = 'magic'
    `)
    // admin: 신규 카테고리 메뉴 권한 부여
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id)
      SELECT 'admin', unnest(ARRAY['pension','assets','invest','shopping','life']::text[])
      ON CONFLICT DO NOTHING
    `)
    await pool.query(
      "INSERT INTO app_migrations (name) VALUES ('v007_restructure_top_menus')"
    )
  }

  // v009: email UNIQUE 제약조건 보장 (ADD COLUMN IF NOT EXISTS는 기존 컬럼에 제약 추가 안 함)
  const { rows: v009 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v009_email_unique_constraint'"
  )
  if (v009.length === 0) {
    // 중복 이메일 제거 (생성일 최신 것 제외하고 삭제)
    await pool.query(`
      DELETE FROM app_users
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at DESC) AS rn
          FROM app_users WHERE email IS NOT NULL
        ) t WHERE rn > 1
      )
    `)
    // UNIQUE 제약조건이 없으면 추가
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'app_users'::regclass AND contype = 'u'
            AND conname LIKE '%email%'
        ) THEN
          ALTER TABLE app_users ADD CONSTRAINT app_users_email_unique UNIQUE (email);
        END IF;
      END$$
    `)
    await pool.query(
      "INSERT INTO app_migrations (name) VALUES ('v009_email_unique_constraint')"
    )
  }

  // v011: 투자 > 글로벌 ETF 하위 메뉴 추가
  const { rows: v011 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v011_add_invest_etf_menus'"
  )
  if (v011.length === 0) {
    await pool.query(`
      INSERT INTO app_menus (id, label, href, parent_id, sort_order) VALUES
        ('etf',          '글로벌 ETF',     '/invest/etf',                          'invest', 10),
        ('etf-holdings', '종목 주가 조회', '/invest/etf/holdings',                 'invest', 20),
        ('etf-price',    '주가 상승 분석', '/invest/etf/analysis/price-rise',      'invest', 30),
        ('etf-vol',      '수량 변동 분석', '/invest/etf/analysis/volume-change',   'invest', 40),
        ('etf-rec',      '추천 종목',      '/invest/etf/recommend',                'invest', 50)
      ON CONFLICT (id) DO NOTHING
    `)
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id)
      SELECT r, m
      FROM unnest(ARRAY['admin','normal']::text[]) AS r
      CROSS JOIN unnest(ARRAY['etf','etf-holdings','etf-price','etf-vol','etf-rec']::text[]) AS m
      ON CONFLICT DO NOTHING
    `)
    await pool.query(
      "INSERT INTO app_migrations (name) VALUES ('v011_add_invest_etf_menus')"
    )
  }

  // v012: 투자 > 미국 경제 지표 하위 메뉴 추가
  const { rows: v012 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v012_add_invest_usa_menus'"
  )
  if (v012.length === 0) {
    await pool.query(`
      INSERT INTO app_menus (id, label, href, parent_id, sort_order) VALUES
        ('usa',           '미국 경제 지표 수집', '/invest/usa',                'invest', 60),
        ('usa-indicator', '미국 경제 지표',      '/invest/usa/indicator',      'invest', 70),
        ('usa-treasury',  '국채 보유',      '/invest/usa/treasury',       'invest', 80),
        ('usa-fx',        '원/달러 환율 조회',  '/invest/usa/fx',             'invest', 90)
      ON CONFLICT (id) DO NOTHING
    `)
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id)
      SELECT r, m
      FROM unnest(ARRAY['admin','normal']::text[]) AS r
      CROSS JOIN unnest(ARRAY['usa','usa-indicator','usa-treasury','usa-fx']::text[]) AS m
      ON CONFLICT DO NOTHING
    `)
    await pool.query(
      "INSERT INTO app_migrations (name) VALUES ('v012_add_invest_usa_menus')"
    )
  }

  // v013: 투자 하위에 그룹 메뉴(글로벌 ETF 분석, 미국 경제 지표 분석) 추가 및 하위 메뉴 재배치
  const { rows: v013 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v013_add_invest_group_menus'"
  )
  if (v013.length === 0) {
    await pool.query(`
      INSERT INTO app_menus (id, label, href, parent_id, sort_order) VALUES
        ('etf-group', '글로벌 ETF 분석',     '/invest/etf', 'invest', 10),
        ('usa-group', '미국 경제 지표 분석', '/invest/usa', 'invest', 20)
      ON CONFLICT (id) DO NOTHING
    `)
    await pool.query(`
      UPDATE app_menus SET parent_id = 'etf-group', sort_order =
        CASE id
          WHEN 'etf'          THEN 10
          WHEN 'etf-holdings' THEN 20
          WHEN 'etf-price'    THEN 30
          WHEN 'etf-vol'      THEN 40
          WHEN 'etf-rec'      THEN 50
        END
      WHERE id IN ('etf', 'etf-holdings', 'etf-price', 'etf-vol', 'etf-rec')
    `)
    await pool.query(`
      UPDATE app_menus SET parent_id = 'usa-group', sort_order =
        CASE id
          WHEN 'usa'           THEN 10
          WHEN 'usa-indicator' THEN 20
          WHEN 'usa-treasury'  THEN 30
          WHEN 'usa-fx'        THEN 40
        END
      WHERE id IN ('usa', 'usa-indicator', 'usa-treasury', 'usa-fx')
    `)
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id)
      SELECT r, m
      FROM unnest(ARRAY['admin','normal']::text[]) AS r
      CROSS JOIN unnest(ARRAY['etf-group','usa-group']::text[]) AS m
      ON CONFLICT DO NOTHING
    `)
    await pool.query(
      "INSERT INTO app_migrations (name) VALUES ('v013_add_invest_group_menus')"
    )
  }

  // v014: ETF 수집 이력 메뉴 이름 변경 — '글로벌 ETF' → '글로벌 ETF 데이터 수집'
  const { rows: v014 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v014_rename_etf_menu'"
  )
  if (v014.length === 0) {
    await pool.query(`UPDATE app_menus SET label = '글로벌 ETF 데이터 수집' WHERE id = 'etf'`)
    await pool.query("INSERT INTO app_migrations (name) VALUES ('v014_rename_etf_menu')")
  }

  // v008: khj 역할 제거 — 기존 khj 사용자 → admin 전환, khj 역할 메뉴 권한 삭제
  const { rows: v008 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v008_remove_khj_role'"
  )
  if (v008.length === 0) {
    await pool.query(`UPDATE app_users SET role = 'admin' WHERE role = 'khj'`)
    await pool.query(`DELETE FROM app_role_menus WHERE role = 'khj'`)
    await pool.query(
      "INSERT INTO app_migrations (name) VALUES ('v008_remove_khj_role')"
    )
  }

  // v015: 자산 > 주식 투자 메뉴 추가 (admin 전용)
  const { rows: v015 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v015_add_stock_menu'"
  )
  if (v015.length === 0) {
    await pool.query(`
      INSERT INTO app_menus (id, label, href, parent_id, sort_order)
      VALUES ('stock', '주식 투자', '/assets/stock', 'assets', 10)
      ON CONFLICT (id) DO NOTHING
    `)
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id)
      VALUES ('admin', 'stock')
      ON CONFLICT DO NOTHING
    `)
    await pool.query("INSERT INTO app_migrations (name) VALUES ('v015_add_stock_menu')")
  }

  // v016: 생활비 관리 테이블 + 메뉴 추가
  const { rows: v016 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v016_add_life_cost'"
  )
  if (v016.length === 0) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS my_cost_item (
        id                   SERIAL PRIMARY KEY,
        item_nm              TEXT NOT NULL,
        in_out               TEXT DEFAULT 'I',
        cost_type            TEXT DEFAULT '1',
        pay_dd               INT,
        item_type1           TEXT NOT NULL,
        item_type2           TEXT,
        amt                  NUMERIC(12,0) DEFAULT 0,
        use_yn               TEXT DEFAULT 'Y',
        memo                 TEXT,
        created_at           TIMESTAMPTZ DEFAULT NOW(),
        updated_at           TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (id)
      )
    `)
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS my_cost_info_id_seq`)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS my_cost_info (
        id          BIGINT DEFAULT nextval('my_cost_info_id_seq') PRIMARY KEY,
        yyyymm      TEXT NOT NULL,
        item_id     INT NOT NULL REFERENCES my_cost_item(id),
        amt         NUMERIC(12,0) DEFAULT 0,
        memo        TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await pool.query(`
      INSERT INTO app_menus (id, label, href, parent_id, sort_order)
      VALUES ('life-cost', '생활비', '/life/cost', 'life', 10)
      ON CONFLICT (id) DO NOTHING
    `)
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id)
      SELECT r, 'life-cost'
      FROM unnest(ARRAY['admin','normal']::text[]) AS r
      ON CONFLICT DO NOTHING
    `)
    await pool.query("INSERT INTO app_migrations (name) VALUES ('v016_add_life_cost')")
  }

  // v017: normal role에 invest, life 부모 메뉴 부여 (etf-group/usa-group/life-cost가 nav에 표시되도록)
  const { rows: v017 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v017_normal_parent_menus'"
  )
  if (v017.length === 0) {
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id)
      SELECT r, m
      FROM unnest(ARRAY['normal']::text[]) AS r
      CROSS JOIN unnest(ARRAY['invest', 'life']::text[]) AS m
      ON CONFLICT DO NOTHING
    `)
    await pool.query("INSERT INTO app_migrations (name) VALUES ('v017_normal_parent_menus')")
  }

  // v018: 쇼핑 메뉴를 생활 카테고리 하위로 이동 (parent_id: null → 'life', sort_order: 20)
  const { rows: v018 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v018_shopping_under_life'"
  )
  if (v018.length === 0) {
    await pool.query("UPDATE app_menus SET parent_id = 'life', sort_order = 20 WHERE id = 'shopping'")
    await pool.query("INSERT INTO app_migrations (name) VALUES ('v018_shopping_under_life')")
  }

  // v019: 쇼핑 관리 테이블 생성 (my_shopping, my_shopping_ref, my_shopping_file)
  const { rows: v019 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v019_add_shopping_tables'"
  )
  if (v019.length === 0) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS my_shopping (
        id             SERIAL PRIMARY KEY,
        category       TEXT NOT NULL,
        purchase_date  DATE NOT NULL,
        product_nm     TEXT NOT NULL,
        card_item_id   INT  REFERENCES my_cost_item(id),
        original_price INT,
        purchase_price INT,
        purchase_place TEXT,
        content        TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS my_shopping_ref (
        id          SERIAL PRIMARY KEY,
        category    TEXT NOT NULL,
        title       TEXT NOT NULL,
        url         TEXT,
        content     TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS my_shopping_file (
        id            SERIAL PRIMARY KEY,
        ref_type      TEXT NOT NULL,
        ref_id        INT  NOT NULL,
        file_nm       TEXT NOT NULL,
        storage_path  TEXT NOT NULL,
        mime_type     TEXT,
        file_size     INT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await pool.query("INSERT INTO app_migrations (name) VALUES ('v019_add_shopping_tables')")
  }

  // v020: 참고자료를 my_shopping 테이블로 통합 (item_type 컬럼 추가, my_shopping_ref 삭제)
  const { rows: v020 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v020_merge_shopping_ref'"
  )
  if (v020.length === 0) {
    await pool.query(`ALTER TABLE my_shopping ALTER COLUMN purchase_date DROP NOT NULL`)
    await pool.query(`ALTER TABLE my_shopping ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'shopping'`)
    await pool.query(`UPDATE my_shopping SET item_type = 'shopping' WHERE item_type IS NULL`)
    await pool.query(`DELETE FROM my_shopping_file WHERE ref_type = 'ref'`)
    await pool.query(`DROP TABLE IF EXISTS my_shopping_ref`)
    await pool.query("INSERT INTO app_migrations (name) VALUES ('v020_merge_shopping_ref')")
  }

  // v021: 카드 상세 마스터(my_card) 연결 — 원장(my_cost_item/my_cost_info)은 그대로 두고
  //        카드명·결제일·정산기간을 my_card에서 읽도록 surrogate id로 연결한다.
  const { rows: v021 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v021_link_my_card'"
  )
  if (v021.length === 0) {
    // 1) 연결 키 — PK(card_no)는 카드번호 원문이라 다른 테이블로 복제하지 않고 surrogate id를 쓴다
    await pool.query(`ALTER TABLE my_card ADD COLUMN IF NOT EXISTS id SERIAL`)
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'my_card_id_key') THEN
          ALTER TABLE my_card ADD CONSTRAINT my_card_id_key UNIQUE (id);
        END IF;
      END $$
    `)
    await pool.query(`ALTER TABLE my_card ADD COLUMN IF NOT EXISTS card_no_last4 VARCHAR`)
    await pool.query(`ALTER TABLE my_cost_item ADD COLUMN IF NOT EXISTS card_id INT`)
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'my_cost_item_card_id_fkey') THEN
          ALTER TABLE my_cost_item ADD CONSTRAINT my_cost_item_card_id_fkey
            FOREIGN KEY (card_id) REFERENCES my_card(id);
        END IF;
      END $$
    `)

    // 2) 기존 카드 항목을 my_card와 연결하고 항목명을 my_card.card_nm 기준으로 통일
    //    (좌: my_cost_item.item_nm 기존값, 우: my_card.card_nm)
    const cardNameMap: [string, string][] = [
      ["우리카드(체크)",   "우리카드(체크)"],
      ["현대카드(네이버)", "현대카드(네비어)"],
      ["국민카드(D-Live)", "국민 D-Live"],
    ]
    for (const [itemNm, cardNm] of cardNameMap) {
      await pool.query(`
        UPDATE my_cost_item i
        SET card_id = cd.id, item_nm = cd.card_nm, updated_at = NOW()
        FROM my_card cd
        WHERE i.item_type1 = '4' AND i.item_nm = $1 AND cd.card_nm = $2
      `, [itemNm, cardNm])
    }

    // 3) my_card 에만 있는 카드는 원장 항목을 새로 만들어 연결 (카드 목록을 my_card 기준으로 맞춤)
    await pool.query(`
      INSERT INTO my_cost_item (item_nm, item_type1, cost_type, pay_dd, amt, use_yn, card_id)
      SELECT cd.card_nm, '4', '1', NULLIF(cd.pay_ymd, ''), 0, 'Y', cd.id
      FROM my_card cd
      WHERE NOT EXISTS (
        SELECT 1 FROM my_cost_item i WHERE i.item_type1 = '4' AND i.card_id = cd.id
      )
    `)

    // 4) my_card 에 대응이 없는 카드 항목은 비활성화 — 월별 실적·쇼핑 참조가 없는 것만 (데이터 보존)
    await pool.query(`
      UPDATE my_cost_item i
      SET use_yn = 'N', updated_at = NOW()
      WHERE i.item_type1 = '4' AND i.card_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM my_cost_info c WHERE c.item_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM my_shopping s WHERE s.card_item_id = i.id)
    `)

    await pool.query("INSERT INTO app_migrations (name) VALUES ('v021_link_my_card')")
  }

  // v022: my_card 민감정보 암호화 (card_no, cvc, limit_ym) + 표시용 뒤 4자리 추출
  //       CARD_ENC_KEY 가 없으면 기록하지 않고 건너뛴다 → 키 등록 후 다음 기동에서 재시도
  const { rows: v022 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v022_encrypt_card_secrets'"
  )
  if (v022.length === 0) {
    if (!process.env.CARD_ENC_KEY) {
      console.warn("[migration] v022 건너뜀 — CARD_ENC_KEY 환경변수가 없습니다.")
    } else {
      const { rows: cards } = await pool.query<{
        id: number
        card_no: string | null
        cvc: string | null
        limit_ym: string | null
        card_no_last4: string | null
      }>(`SELECT id, card_no, cvc, limit_ym, card_no_last4 FROM my_card`)

      for (const c of cards) {
        // card_no 는 PK(NOT NULL) — 빈 값이면 암호화 결과가 null 이 되므로 원본을 유지
        const encCardNo = c.card_no ? (encryptField(c.card_no) ?? c.card_no) : c.card_no

        // 되돌릴 수 없는 변환이므로 UPDATE 전에 암→복호화 왕복을 검증한다
        for (const [col, plain, enc] of [
          ["card_no",  c.card_no,  encCardNo],
          ["cvc",      c.cvc,      encryptField(c.cvc)],
          ["limit_ym", c.limit_ym, encryptField(c.limit_ym)],
        ] as [string, string | null, string | null][]) {
          if (plain && decryptField(enc) !== plain) {
            throw new Error(`v022 중단: my_card.id=${c.id} ${col} 암/복호화 왕복 검증 실패`)
          }
        }

        await pool.query(`
          UPDATE my_card SET card_no = $2, cvc = $3, limit_ym = $4, card_no_last4 = $5
          WHERE id = $1
        `, [
          c.id,
          encCardNo,
          encryptField(c.cvc),
          encryptField(c.limit_ym),
          c.card_no_last4 ?? extractLast4(c.card_no),
        ])
      }
      await pool.query("INSERT INTO app_migrations (name) VALUES ('v022_encrypt_card_secrets')")
    }
  }

  // v023: 전기요금 관리 — 요금표(이력)·월별 청구·일별 사용량 + 메뉴 등록
  const { rows: v023 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v023_add_power'"
  )
  if (v023.length === 0) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS my_power_rate (
        id            SERIAL PRIMARY KEY,
        apply_start   DATE NOT NULL,
        season        TEXT NOT NULL,              -- 'S'=여름(07.01~08.31), 'O'=기타
        tier1_limit   INT  NOT NULL,
        tier2_limit   INT  NOT NULL,
        base1         INT  NOT NULL,
        base2         INT  NOT NULL,
        base3         INT  NOT NULL,
        rate1         NUMERIC(8,2) NOT NULL,
        rate2         NUMERIC(8,2) NOT NULL,
        rate3         NUMERIC(8,2) NOT NULL,
        welfare_limit INT  NOT NULL,
        env_rate      NUMERIC(8,2) NOT NULL DEFAULT 9,
        fuel_rate     NUMERIC(8,2) NOT NULL DEFAULT 5,
        fund_rate     NUMERIC(6,4) NOT NULL DEFAULT 2.7,
        vat_rate      NUMERIC(6,4) NOT NULL DEFAULT 10,
        memo          TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (apply_start, season)
      )
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS my_power_bill (
        id              SERIAL PRIMARY KEY,
        yyyymm          TEXT NOT NULL UNIQUE,
        period_start    DATE NOT NULL,
        period_end      DATE NOT NULL,
        meter_now       INT,
        usage_kwh       NUMERIC(10,1) NOT NULL DEFAULT 0,
        season_discount INT NOT NULL DEFAULT 0,
        target_kwh      NUMERIC(10,1),
        memo            TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS my_power_daily (
        id         SERIAL PRIMARY KEY,
        yyyymm     TEXT NOT NULL,
        use_date   DATE NOT NULL,
        usage_kwh  NUMERIC(6,1),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (yyyymm, use_date)
      )
    `)

    // 초기 요금표 — 2026-01-22 인상분은 시트 실측치로 검증됨.
    // 2025년 1구간 기본요금(910)은 한전 표준값 추정치라 확인 후 수정 필요.
    await pool.query(`
      INSERT INTO my_power_rate
        (apply_start, season, tier1_limit, tier2_limit, base1, base2, base3,
         rate1, rate2, rate3, welfare_limit, memo)
      VALUES
        ('2025-01-01', 'O', 200, 200,  910, 1600, 7300, 120,   214.6, 307.3, 16000, '2025년 단가'),
        ('2025-01-01', 'S', 300, 150,  910, 1600, 7300, 120,   214.6, 307.3, 20000, '2025년 단가'),
        ('2026-01-22', 'O', 200, 200,  730, 1260, 6060, 105,   174.0, 242.3, 16000, '2026-01-22 인상'),
        ('2026-01-22', 'S', 300, 150,  730, 1260, 6060, 105,   174.0, 242.3, 20000, '2026-01-22 인상')
      ON CONFLICT (apply_start, season) DO NOTHING
    `)

    await pool.query(`
      INSERT INTO app_menus (id, label, href, parent_id, sort_order)
      VALUES ('life-power', '전기요금', '/life/power', 'life', 15)
      ON CONFLICT (id) DO NOTHING
    `)
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id)
      SELECT r, 'life-power'
      FROM unnest(ARRAY['admin','normal']::text[]) AS r
      ON CONFLICT DO NOTHING
    `)
    await pool.query("INSERT INTO app_migrations (name) VALUES ('v023_add_power')")
  }

  // v024: 전기요금 — 복지할인 적용 여부 추가, 사용기간 컬럼 제거
  //       사용기간은 항상 "전월 22일 ~ 당월 21일" 이라 요금월에서 유도한다 (lib/power-calc.ts derivePeriod)
  const { rows: v024 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v024_power_welfare_flag'"
  )
  if (v024.length === 0) {
    await pool.query(`ALTER TABLE my_power_bill ADD COLUMN IF NOT EXISTS welfare_yn TEXT NOT NULL DEFAULT 'Y'`)
    await pool.query(`ALTER TABLE my_power_bill DROP COLUMN IF EXISTS period_start`)
    await pool.query(`ALTER TABLE my_power_bill DROP COLUMN IF EXISTS period_end`)
    await pool.query("INSERT INTO app_migrations (name) VALUES ('v024_power_welfare_flag')")
  }

  // v025: 전기요금 청구에서 쓰지 않는 컬럼 제거 (당월 지침·비고)
  const { rows: v025 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v025_power_drop_unused'"
  )
  if (v025.length === 0) {
    await pool.query(`ALTER TABLE my_power_bill DROP COLUMN IF EXISTS meter_now`)
    await pool.query(`ALTER TABLE my_power_bill DROP COLUMN IF EXISTS memo`)
    await pool.query("INSERT INTO app_migrations (name) VALUES ('v025_power_drop_unused')")
  }

  // v026: normal 역할은 연금투자 시뮬레이션·복리의 마법만 접근하도록 축소
  //       (메뉴 숨김만으로는 URL 직접 입력을 못 막으므로 middleware·lib/guard 와 함께 적용)
  const { rows: v026 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v026_normal_menu_minimal'"
  )
  if (v026.length === 0) {
    await pool.query(`
      DELETE FROM app_role_menus
      WHERE role = 'normal' AND menu_id NOT IN ('sim', 'magic')
    `)
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id)
      SELECT 'normal', m FROM unnest(ARRAY['sim','magic']::text[]) AS m
      ON CONFLICT DO NOTHING
    `)
    await pool.query("INSERT INTO app_migrations (name) VALUES ('v026_normal_menu_minimal')")
  }

  // v027 (my_pension_per_config) · v028 (my_profile) 은 철회됐다.
  // 개인 정보와 개인연금 적립 계획은 DB 테이블이 아니라 config/.env 로 관리한다
  // → lib/settings.ts. 두 테이블은 수동으로 DROP 했고 마이그레이션도 제거했다.
  // app_migrations 에 남은 v027/v028 기록은 재실행을 막을 뿐이라 그대로 둔다.

  // v029: 노령연금 메뉴 삭제 (화면·문서 함께 제거)
  const { rows: v029 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v029_drop_seni_menu'"
  )
  if (v029.length === 0) {
    // FK 때문에 권한 매핑을 먼저 지운다
    await pool.query(`DELETE FROM app_role_menus WHERE menu_id = 'seni'`)
    await pool.query(`DELETE FROM app_menus WHERE id = 'seni'`)
    await pool.query("INSERT INTO app_migrations (name) VALUES ('v029_drop_seni_menu')")
  }

  // v010: 메뉴 ID 단축 (savings-fund→sim, compound-magic→magic, personal-pension→per 등)
  const { rows: v010 } = await pool.query<{ name: string }>(
    "SELECT name FROM app_migrations WHERE name = 'v010_shorten_menu_ids'"
  )
  if (v010.length === 0) {
    // FK 제약조건 임시 제거
    await pool.query(`ALTER TABLE app_role_menus DROP CONSTRAINT IF EXISTS app_role_menus_menu_id_fkey`)
    // app_menus PK 변경
    await pool.query(`UPDATE app_menus SET id = 'sim'    WHERE id = 'savings-fund'`)
    await pool.query(`UPDATE app_menus SET id = 'magic'  WHERE id = 'compound-magic'`)
    await pool.query(`UPDATE app_menus SET id = 'per'    WHERE id = 'personal-pension'`)
    await pool.query(`UPDATE app_menus SET id = 'ret'    WHERE id = 'retirement-pension'`)
    await pool.query(`UPDATE app_menus SET id = 'nat'    WHERE id = 'national-pension'`)
    await pool.query(`UPDATE app_menus SET id = 'seni'   WHERE id = 'senior-pension'`)
    // app_role_menus FK 값 동기화
    await pool.query(`UPDATE app_role_menus SET menu_id = 'sim'    WHERE menu_id = 'savings-fund'`)
    await pool.query(`UPDATE app_role_menus SET menu_id = 'magic'  WHERE menu_id = 'compound-magic'`)
    await pool.query(`UPDATE app_role_menus SET menu_id = 'per'    WHERE menu_id = 'personal-pension'`)
    await pool.query(`UPDATE app_role_menus SET menu_id = 'ret'    WHERE menu_id = 'retirement-pension'`)
    await pool.query(`UPDATE app_role_menus SET menu_id = 'nat'    WHERE menu_id = 'national-pension'`)
    await pool.query(`UPDATE app_role_menus SET menu_id = 'seni'   WHERE menu_id = 'senior-pension'`)
    // FK 제약조건 복원
    await pool.query(`
      ALTER TABLE app_role_menus ADD CONSTRAINT app_role_menus_menu_id_fkey
        FOREIGN KEY (menu_id) REFERENCES app_menus(id)
    `)
    await pool.query(
      "INSERT INTO app_migrations (name) VALUES ('v010_shorten_menu_ids')"
    )
  }

}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

export async function createUser(email: string, name: string): Promise<void> {
  const pool = getPensionPool()
  const { randomUUID } = await import("crypto")
  await pool.query(
    `INSERT INTO app_users (id, name, password_hash, role, email) VALUES ($1, $2, 'GOOGLE_AUTH', 'normal', $3)`,
    [randomUUID(), name, email]
  )
}

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  const pool = getPensionPool()
  const { rows } = await pool.query<DbUser>(
    "SELECT id, name, password_hash, role FROM app_users WHERE email = $1",
    [email]
  )
  return rows[0] ?? null
}

export async function findUser(id: string): Promise<DbUser | null> {
  const pool = getPensionPool()
  const { rows } = await pool.query<DbUser>(
    "SELECT id, name, password_hash, role FROM app_users WHERE id = $1",
    [id]
  )
  return rows[0] ?? null
}

export async function getMenusForRole(role: string): Promise<MenuRow[]> {
  const pool = getPensionPool()
  const { rows } = await pool.query<MenuRow>(`
    SELECT m.id, m.label, m.href, m.parent_id, m.sort_order
    FROM app_menus m
    JOIN app_role_menus rm ON rm.menu_id = m.id
    WHERE rm.role = $1
    ORDER BY m.sort_order
  `, [role])
  return rows
}
