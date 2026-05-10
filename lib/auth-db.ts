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
  const { rows: uc } = await pool.query<{ c: string }>("SELECT COUNT(*) AS c FROM app_users")
  if (parseInt(uc[0].c) === 0) {
    await pool.query(`
      INSERT INTO app_users (id, name, password_hash, role) VALUES
        ('skc',  '신기철', '73927e165d5bf16bbcb2abf6039903375d735c9e6ce3efd3b0f854b11d5ece6c', 'admin'),
        ('user', '테스터', '0ac8adfad468b363de01d0556d4239831b654eab5d732cf7564b8e975853c22c', 'normal'),
        ('khj',  '김현정', '653a64eed49df7e39aa9648d73a5df94ac21ea5d152da63d0fc5118ee8ed66a8', 'khj')
    `)
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
