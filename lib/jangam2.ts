/**
 * data/jangam2.md 파서 — 장암2구역 투자 현황 데이터.
 *
 * 서버 전용 (fs 사용). 클라이언트 컴포넌트에서 import 하지 않는다.
 * 섹션 규칙과 작성 기준은 docs/invest/jangam2/jangam2_task.md 참고.
 *
 * 캐시하지 않는다 — 호출마다 읽어야 MD 수정이 새로고침만으로 반영된다.
 */

import fs from "fs"
import path from "path"

/** 조합원 분양 예정가 평형 (고정) */
export const UNIT_SIZES = ["23평", "26평", "35평", "39평", "43평"] as const

export type AssetEval = {
  date:      string   // YYYY-MM-DD
  eval_amt:  number   // 평가금액 (원)
  ratio:     number   // 비례율 (%)
  right_amt: number   // 권리가액 (원)
}

export type UnitPrice = {
  date:    string                             // YYYY-MM-DD
  by_size: Record<string, number | null>      // "23평" → 예정가 (원), 미정이면 null
}

export type Jangam2Data = {
  general:  { key: string; value: string }[]
  progress: { date: string; title: string; note: string }[]
  gifts:    string[]
  features: string[]
  assets:   AssetEval[]    // 일자 내림차순 — [0] 이 최신
  prices:   UnitPrice[]    // 일자 내림차순 — [0] 이 최신
  account:  { account_no: string; account_nm: string } | null
  others:   { item: string; amt: number; note: string }[]   // 준비된 재원 — 필요 자금에서 뺀다
  interests: InterestRow[]                                  // 이자 비용 — 평형별로 필요 자금에 더한다
}

/** 이자 비용 한 항목 — 분양가에 비례해 평형마다 다르다 */
export type InterestRow = {
  item:    string
  by_size: Record<string, number | null>
  note:    string
}

const EMPTY: Jangam2Data = {
  general: [], progress: [], gifts: [], features: [],
  assets: [], prices: [], account: null, others: [], interests: [],
}

/** "## 제목" 기준으로 본문을 나눈다. 제목 앞뒤 공백은 무시. */
function splitSections(md: string): Map<string, string[]> {
  const sections = new Map<string, string[]>()
  let current: string[] | null = null

  for (const raw of md.split(/\r?\n/)) {
    const heading = raw.match(/^##\s+(.+?)\s*$/)
    if (heading) {
      current = []
      sections.set(heading[1], current)
      continue
    }
    // "# 제목" 은 문서 제목이라 섹션을 끝내지 않는다 — 그 아래 인용문도 무시된다
    if (current) current.push(raw)
  }
  return sections
}

/** "- 키: 값" → { key, value } */
function parseKeyValues(lines: string[]): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = []
  for (const line of lines) {
    const m = line.match(/^\s*-\s+([^:]+):\s*(.*)$/)
    if (m) out.push({ key: m[1].trim(), value: m[2].trim() })
  }
  return out
}

/** "- 값" → 값 (콜론이 있어도 그대로 한 줄로 본다) */
function parseBullets(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    const m = line.match(/^\s*-\s+(.*\S)\s*$/)
    if (m) out.push(m[1].trim())
  }
  return out
}

/** GFM 표 → 헤더 1행 + 데이터 행. 구분선(| --- |)은 건너뛴다. */
function parseTable(lines: string[]): { headers: string[]; rows: string[][] } {
  const cells = (line: string) =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())

  const tableLines = lines.filter((l) => l.trim().startsWith("|"))
  if (tableLines.length === 0) return { headers: [], rows: [] }

  const headers = cells(tableLines[0])
  const rows = tableLines
    .slice(1)
    .filter((l) => !/^\s*\|[\s|:-]*\|?\s*$/.test(l))   // 구분선 제거
    .map(cells)
    .filter((r) => r.some((c) => c !== ""))            // 빈 행 제거

  return { headers, rows }
}

/** "161,280,000" · "161280000 원" → 161280000. 빈 값·해석 불가면 null */
function num(s: string | undefined): number | null {
  if (s == null) return null
  const cleaned = s.replace(/[,\s원%]/g, "")
  if (cleaned === "") return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** 헤더에서 평형 컬럼을 찾아 값을 뽑는다. 컬럼이 없거나 빈 칸이면 null (첫 컬럼은 일자·항목이라 제외) */
function bySize(headers: string[], row: string[]): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const size of UNIT_SIZES) {
    const col = headers.indexOf(size)
    out[size] = col > 0 ? num(row[col]) : null
  }
  return out
}

/** 일자 내림차순 (문자열 비교 — YYYY-MM-DD 형식 전제) */
function byDateDesc<T extends { date: string }>(a: T, b: T): number {
  return b.date.localeCompare(a.date)
}

export function readJangam2Data(): Jangam2Data {
  let md: string
  try {
    md = fs.readFileSync(path.join(process.cwd(), "data", "jangam2.md"), "utf8")
  } catch {
    return EMPTY   // 파일이 없어도 화면은 "자료 없음" 으로 뜬다
  }

  const s = splitSections(md)
  /** 먼저 찾히는 섹션을 쓴다 — 제목을 바꿔도 예전 이름이 계속 동작하게 별칭을 허용한다 */
  const lines = (...names: string[]) => {
    for (const n of names) {
      const found = s.get(n)
      if (found) return found
    }
    return []
  }

  // 추진 경과 — | 일자 | 내용 | 비고 | (비고는 없어도 된다)
  const progressTable = parseTable(lines("추진 경과"))
  const progress = progressTable.rows
    .map((r) => ({ date: r[0] ?? "", title: r[1] ?? "", note: r[2] ?? "" }))
    .filter((p) => p.date !== "")
    .sort(byDateDesc)

  // 종전자산 평가 — | 일자 | 평가금액 | 비례율 | 권리가액 |
  const assets = parseTable(lines("종전자산 평가")).rows
    .map((r) => ({
      date:      r[0] ?? "",
      eval_amt:  num(r[1]) ?? 0,
      ratio:     num(r[2]) ?? 0,
      right_amt: num(r[3]) ?? 0,
    }))
    .filter((a) => a.date !== "")
    .sort(byDateDesc)

  // 조합원 분양 예정가 — | 일자 | 23평 | … | 43평 | (헤더에 적힌 평형을 따른다)
  const priceTable = parseTable(lines("조합원 분양 예정가"))
  const prices = priceTable.rows
    .map((r) => ({ date: r[0] ?? "", by_size: bySize(priceTable.headers, r) }))
    .filter((p) => p.date !== "")
    .sort(byDateDesc)

  // 주식 계좌 — - 계좌번호: … / - 계좌명: …
  const accountKv = parseKeyValues(lines("주식 계좌"))
  const account_no = accountKv.find((k) => k.key === "계좌번호")?.value ?? ""
  const account_nm = accountKv.find((k) => k.key === "계좌명")?.value ?? ""
  const account = account_no !== "" ? { account_no, account_nm } : null

  // 기타 준비 자금 — | 항목 | 금액 | 비고 | (필요 자금에서 뺀다)
  const others = parseTable(lines("기타 준비 자금")).rows
    .map((r) => ({ item: r[0] ?? "", amt: num(r[1]) ?? 0, note: r[2] ?? "" }))
    .filter((o) => o.item !== "")

  // 이자 비용 — | 항목 | 23평 | … | 43평 | 비고 | (평형별로 필요 자금에 더한다)
  const interestTable = parseTable(lines("이자 비용"))
  const noteCol = interestTable.headers.indexOf("비고")
  const interests = interestTable.rows
    .map((r) => ({
      item:    r[0] ?? "",
      by_size: bySize(interestTable.headers, r),
      note:    noteCol > 0 ? (r[noteCol] ?? "") : "",
    }))
    .filter((o) => o.item !== "")

  return {
    general:  parseKeyValues(lines("일반 현황")),
    progress,
    gifts:    parseBullets(lines("조합원 제공품")),
    features: parseBullets(lines("특화 품목", "아파트 특화")),
    assets,
    prices,
    account,
    others,
    interests,
  }
}
