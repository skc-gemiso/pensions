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

  // 초기 사용자 시딩 (테이블이 비어있을 때만)
  // 비밀번호는 환경변수에서 읽어 해시 후 저장 — 소스코드에 해시값 노출 방지
  const { rows: uc } = await pool.query<{ c: string }>("SELECT COUNT(*) AS c FROM app_users")
  if (parseInt(uc[0].c) === 0) {
    const p1 = process.env.SEED_ADMIN_PASSWORD
    const p2 = process.env.SEED_USER_PASSWORD
    const p3 = process.env.SEED_KHJ_PASSWORD
    if (!p1 || !p2 || !p3) {
      throw new Error("SEED_*_PASSWORD 환경변수가 설정되지 않았습니다.")
    }
    await pool.query(
      `INSERT INTO app_users (id, name, password_hash, role) VALUES
        ($1, '신기철', $2, 'admin'),
        ($3, '테스터', $4, 'normal'),
        ($5, '김현정', $6, 'khj')`,
      ["skc", sha256(p1), "user", sha256(p2), "khj", sha256(p3)]
    )
  }

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
        ('savings-fund',       '연금투자 시뮬레이션', '/sim',         NULL,       60),
        ('compound-magic',     '복리의 마법',         '/magic',        NULL,       70)
    `)
    // 연금 하위 메뉴
    await pool.query(`
      INSERT INTO app_menus (id, label, href, parent_id, sort_order) VALUES
        ('home',               '나의 연금 현황',      '/pension/my',   'pension',  10),
        ('personal-pension',   '개인연금',            '/pension/per',  'pension',  20),
        ('retirement-pension', '퇴직연금',            '/pension/ret',  'pension',  30),
        ('national-pension',   '국민연금',            '/pension/nat',  'pension',  40),
        ('senior-pension',     '노령연금',            '/pension/seni', 'pension',  50)
    `)

    // admin, khj: 전체 메뉴
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id)
      SELECT r.role, m.id
      FROM app_menus m
      CROSS JOIN (SELECT unnest(ARRAY['admin','khj']::text[]) AS role) r
    `)

    // normal: 연금투자 시뮬레이션 + 복리의 마법 접근 가능
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id) VALUES
        ('normal', 'savings-fund'),
        ('normal', 'compound-magic')
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
      "UPDATE app_menus SET parent_id = NULL, sort_order = 60 WHERE id = 'savings-fund'"
    )
    await pool.query(
      "DELETE FROM app_role_menus WHERE role = 'normal' AND menu_id = 'personal-pension'"
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
      "UPDATE app_menus SET parent_id = NULL, sort_order = 70 WHERE id = 'compound-magic'"
    )
    // 모든 역할에 복리의 마법 권한 부여 (admin/khj는 이미 있으므로 충돌 무시)
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id)
      SELECT unnest(ARRAY['admin','khj','normal']::text[]), 'compound-magic'
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
      "UPDATE app_menus SET href = '/personal-pension' WHERE id = 'personal-pension'"
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
    await pool.query("UPDATE app_menus SET href = '/sim'   WHERE id = 'savings-fund'")
    await pool.query("UPDATE app_menus SET href = '/magic' WHERE id = 'compound-magic'")
    // compound-magic 전체 공개 (이미 v003에서 처리됐지만 누락 방지)
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id)
      SELECT unnest(ARRAY['admin','khj','normal']::text[]), 'compound-magic'
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
      UPDATE app_menus SET href = '/pension/per',  parent_id = 'pension', sort_order = 20 WHERE id = 'personal-pension'
    `)
    await pool.query(`
      UPDATE app_menus SET href = '/pension/ret',  parent_id = 'pension', sort_order = 30 WHERE id = 'retirement-pension'
    `)
    await pool.query(`
      UPDATE app_menus SET href = '/pension/nat',  parent_id = 'pension', sort_order = 40 WHERE id = 'national-pension'
    `)
    await pool.query(`
      UPDATE app_menus SET href = '/pension/seni', parent_id = 'pension', sort_order = 50 WHERE id = 'senior-pension'
    `)
    // savings-fund, compound-magic sort_order 유지 (60, 70)
    await pool.query(`
      UPDATE app_menus SET sort_order = 60 WHERE id = 'savings-fund'
    `)
    await pool.query(`
      UPDATE app_menus SET sort_order = 70 WHERE id = 'compound-magic'
    `)
    // admin, khj: 신규 카테고리 메뉴 권한 부여
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id)
      SELECT r.role, m.menu_id
      FROM (SELECT unnest(ARRAY['admin','khj']::text[]) AS role) r
      CROSS JOIN (SELECT unnest(ARRAY['pension','assets','invest','shopping','life']::text[]) AS menu_id) m
      ON CONFLICT DO NOTHING
    `)
    await pool.query(
      "INSERT INTO app_migrations (name) VALUES ('v007_restructure_top_menus')"
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
