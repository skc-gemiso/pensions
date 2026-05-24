import { spawn } from "child_process"
import path from "path"
import { getPensionPool } from "@/lib/pension-db"

export type CollectStatus = {
  running: boolean
  startedAt: string | null
  finishedAt: string | null
  success: boolean | null
  output: string
}

const g = global as typeof global & { _etfCollectState?: CollectStatus }
if (!g._etfCollectState) {
  g._etfCollectState = {
    running: false,
    startedAt: null,
    finishedAt: null,
    success: null,
    output: "",
  }
}

export function getCollectStatus(): CollectStatus {
  return { ...g._etfCollectState! }
}

export function startCollection(): { started: boolean; reason?: string } {
  if (g._etfCollectState!.running) {
    return { started: false, reason: "already running" }
  }

  const state = g._etfCollectState!
  state.running = true
  state.startedAt = new Date().toISOString()
  state.finishedAt = null
  state.success = null
  state.output = ""

  const collectorDir = path.resolve(process.cwd(), "collector", "etf")
  const pythonCmd = process.platform === "win32" ? "python" : "python3"

  const proc = spawn(pythonCmd, ["fetch_holdings.py"], { cwd: collectorDir })

  proc.stdout.on("data", (data: Buffer) => {
    state.output += data.toString()
    if (state.output.length > 50000) state.output = state.output.slice(-50000)
  })
  proc.stderr.on("data", (data: Buffer) => {
    state.output += data.toString()
    if (state.output.length > 50000) state.output = state.output.slice(-50000)
  })
  proc.on("close", async (code: number | null) => {
    state.running = false
    state.finishedAt = new Date().toISOString()
    state.success = code === 0
    console.log(`[ETF Collector] 완료 (exit=${code})`)

    if (code === 0) {
      try {
        const pool = getPensionPool()
        const { rowCount } = await pool.query(`
          UPDATE etf_holdings a
          SET    name = (SELECT stock_short_name FROM t_stock_list b WHERE b.stock_code = a.ticker)
          WHERE  a.market_currency = 'KRW'
          AND    EXISTS (SELECT 'X' FROM t_stock_list b WHERE b.stock_code = a.ticker)
        `)
        console.log(`[ETF Collector] 한국 종목 이름 한글 변환 완료 (${rowCount}건)`)
        state.output += `\n[한글 변환] ${rowCount}건 업데이트 완료`
      } catch (err) {
        console.error("[ETF Collector] 한글 변환 실패:", err)
        state.output += `\n[한글 변환 실패] ${err}`
      }
    }
  })
  proc.on("error", (err) => {
    state.running = false
    state.finishedAt = new Date().toISOString()
    state.success = false
    state.output += `\n[ERROR] ${err.message}`
  })

  console.log(`[ETF Collector] 시작: ${collectorDir}`)
  return { started: true }
}
