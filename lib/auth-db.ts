import { createHash } from "crypto"
import { getPensionPool } from "./pension-db"

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
        ('nat',   '국민연금',            '/pension/nat',  'pension',  40),
        ('seni',     '노령연금',            '/pension/seni', 'pension',  50)
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS my_cost_info (
        id          SERIAL PRIMARY KEY,
        yyyymm      TEXT NOT NULL,
        item_id     INT NOT NULL REFERENCES my_cost_item(id),
        amt         NUMERIC(12,0) DEFAULT 0,
        memo        TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (id)
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
