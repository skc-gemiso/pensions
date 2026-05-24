import pg from "pg"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import dotenv from "dotenv"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../config/.env") })

const pool = new pg.Pool({
  host:     process.env.PENSION_SIM_DB_HOST,
  port:     Number(process.env.PENSION_SIM_DB_PORT),
  database: process.env.PENSION_SIM_DB_NAME,
  user:     process.env.PENSION_SIM_DB_USER,
  password: process.env.PENSION_SIM_DB_PASSWORD,
  ssl:      process.env.PENSION_SIM_DB_SSL === "true" ? { rejectUnauthorized: false } : false,
})

const sqlFile = process.argv[2]
if (!sqlFile) {
  console.error("Usage: node scripts/run-sql.mjs <sql-file>")
  process.exit(1)
}

const sql = fs.readFileSync(path.resolve(sqlFile), "utf8")

try {
  await pool.query(sql)
  console.log("OK:", sqlFile)
} catch (e) {
  console.error("ERROR:", e.message)
  process.exit(1)
} finally {
  await pool.end()
}
