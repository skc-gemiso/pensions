import pg from "pg"
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
  ssl:      false,
})

const { rows } = await pool.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_name IN ('indicator_master','indicator_data','exchange_rate','treasury_holding','usa_collect_log')
   ORDER BY table_name`
)
console.log("생성된 테이블:", rows.map(r => r.table_name).join(", "))
await pool.end()
