import { spawn } from "child_process"
import path from "path"

export type CollectStatus = {
  running: boolean
  startedAt: string | null
  finishedAt: string | null
  success: boolean | null
  output: string
}

const g = global as typeof global & {
  _usaCollectState?: CollectStatus
  _usaFxState?: CollectStatus
}
if (!g._usaCollectState) {
  g._usaCollectState = { running: false, startedAt: null, finishedAt: null, success: null, output: "" }
}
if (!g._usaFxState) {
  g._usaFxState = { running: false, startedAt: null, finishedAt: null, success: null, output: "" }
}

export function getCollectStatus(): CollectStatus {
  return { ...g._usaCollectState! }
}

export function getFxCollectStatus(): CollectStatus {
  return { ...g._usaFxState! }
}

export function startFxCollection(): { started: boolean; reason?: string } {
  if (g._usaFxState!.running) {
    return { started: false, reason: "already running" }
  }

  const state = g._usaFxState!
  state.running = true
  state.startedAt = new Date().toISOString()
  state.finishedAt = null
  state.success = null
  state.output = ""

  const collectorDir = path.resolve(process.cwd(), "collector", "usa")
  const pythonCmd = process.platform === "win32" ? "python" : "python3"

  const proc = spawn(pythonCmd, ["main.py", "--only", "fx"], { cwd: collectorDir })

  proc.stdout.on("data", (data: Buffer) => {
    state.output += data.toString()
    if (state.output.length > 50000) state.output = state.output.slice(-50000)
  })
  proc.stderr.on("data", (data: Buffer) => {
    state.output += data.toString()
    if (state.output.length > 50000) state.output = state.output.slice(-50000)
  })
  proc.on("close", (code: number | null) => {
    state.running = false
    state.finishedAt = new Date().toISOString()
    state.success = code === 0
    console.log(`[FX Collector] 완료 (exit=${code})`)
  })
  proc.on("error", (err) => {
    state.running = false
    state.finishedAt = new Date().toISOString()
    state.success = false
    state.output += `\n[ERROR] ${err.message}`
  })

  console.log(`[FX Collector] 시작: ${collectorDir}`)
  return { started: true }
}

export function startCollection(): { started: boolean; reason?: string } {
  if (g._usaCollectState!.running) {
    return { started: false, reason: "already running" }
  }

  const state = g._usaCollectState!
  state.running = true
  state.startedAt = new Date().toISOString()
  state.finishedAt = null
  state.success = null
  state.output = ""

  const collectorDir = path.resolve(process.cwd(), "collector", "usa")
  const pythonCmd = process.platform === "win32" ? "python" : "python3"

  const proc = spawn(pythonCmd, ["main.py", "--only", "fred", "tic"], { cwd: collectorDir })

  proc.stdout.on("data", (data: Buffer) => {
    state.output += data.toString()
    if (state.output.length > 50000) state.output = state.output.slice(-50000)
  })
  proc.stderr.on("data", (data: Buffer) => {
    state.output += data.toString()
    if (state.output.length > 50000) state.output = state.output.slice(-50000)
  })
  proc.on("close", (code: number | null) => {
    state.running = false
    state.finishedAt = new Date().toISOString()
    state.success = code === 0
    console.log(`[USA Collector] 완료 (exit=${code})`)
  })
  proc.on("error", (err) => {
    state.running = false
    state.finishedAt = new Date().toISOString()
    state.success = false
    state.output += `\n[ERROR] ${err.message}`
  })

  console.log(`[USA Collector] 시작: ${collectorDir}`)
  return { started: true }
}


