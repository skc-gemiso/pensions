import { Pool } from "pg"

declare global {
  // eslint-disable-next-line no-var
  var _pensionPool: Pool | undefined
}

export function getPensionPool(): Pool {
  if (!global._pensionPool) {
    global._pensionPool = new Pool({
      host: process.env.PENSION_SIM_DB_HOST,
      port: Number(process.env.PENSION_SIM_DB_PORT ?? 5432),
      database: process.env.PENSION_SIM_DB_NAME,
      user: process.env.PENSION_SIM_DB_USER,
      password: process.env.PENSION_SIM_DB_PASSWORD,
      ssl: process.env.PENSION_SIM_DB_SSL === "false" ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
    })
  }
  return global._pensionPool
}
