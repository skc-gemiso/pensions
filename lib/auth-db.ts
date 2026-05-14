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
}

let initPromise: Promise<void> | null = null

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
    await pool.query(`
      INSERT INTO app_menus (id, label, href, parent_id, sort_order) VALUES
        ('home',              '나의 연금 현황',      '/',                               NULL,               10),
        ('national-pension',  '국민연금',            '/national-pension',               NULL,               20),
        ('retirement-pension','퇴직연금',            '/retirement-pension',             NULL,               30),
        ('personal-pension',  '개인연금',            '/personal-pension',               NULL,               40),
        ('savings-fund',      '연금투자 시뮬레이션', '/personal-pension/savings-fund',  'personal-pension', 10),
        ('irp',               'IRP',                 '/personal-pension/irp',           'personal-pension', 20),
        ('isa',               'ISA',                 '/personal-pension/isa',           'personal-pension', 30),
        ('compound-magic',    '복리의 마법',         '/personal-pension/compound-magic','personal-pension', 40),
        ('senior-pension',    '노령연금',            '/senior-pension',                 NULL,               50)
    `)

    // admin, khj: 전체 메뉴
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id)
      SELECT r.role, m.id
      FROM app_menus m
      CROSS JOIN (SELECT unnest(ARRAY['admin','khj']::text[]) AS role) r
    `)

    // normal: 개인연금 상위 + 연금투자 시뮬레이션만
    await pool.query(`
      INSERT INTO app_role_menus (role, menu_id) VALUES
        ('normal', 'personal-pension'),
        ('normal', 'savings-fund')
    `)
  }
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
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
