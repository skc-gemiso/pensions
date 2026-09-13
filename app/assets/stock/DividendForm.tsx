"use client"

import { useState } from "react"
import { addEtfDividend, updateEtfDividend } from "./actions"
import type { EtfDividendRow } from "@/app/sim/actions"

type DivFormState = {
  ref_date: string
  pay_date: string
  dist_rate: string
  dist_amt: string
  tax_base_amt: string
}

const EMPTY_DIV_FORM: DivFormState = {
  ref_date: "",
  pay_date: "",
  dist_rate: "",
  dist_amt: "",
  tax_base_amt: "",
}

/** "26.08.14" · "2026-08-14" · "2026/8/14" → "2026-08-14" (input[type=date] 형식). 실패 시 "" */
function parseDateToken(token: string): string {
  const m = token.trim().replace(/\.$/, "").match(/^(\d{2}|\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/)
  if (!m) return ""
  const year = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1])
  const mm = String(Number(m[2])).padStart(2, "0")
  const dd = String(Number(m[3])).padStart(2, "0")
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return ""
  return `${year}-${mm}-${dd}`
}

/** "1.36%" → "1.36", "1,234" → "1234" */
function parseNumToken(token: string): string {
  return token.replace(/[%,\s]/g, "").trim()
}

/**
 * 엑셀·표에서 복사한 한 행을 분배금 입력값으로 변환.
 * 열 순서: 지급기준일 / 실지급일 / 분배율 / 주당 분배금 / 과세표준액
 *   예) "26.08.14\t26.08.19\t1.36%\t270\t3"
 */
function parseDividendPaste(text: string): { form: DivFormState; rowCount: number } | null {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return null

  // 탭 우선. 탭이 없으면 2칸 이상 공백, 그것도 없으면 단일 공백으로 분리한다.
  // 빈 칸이 그대로 열 위치를 지키도록 filter 는 하지 않는다.
  let cols = lines[0].split("\t")
  if (cols.length < 2) cols = lines[0].split(/\s{2,}/)
  if (cols.length < 2) cols = lines[0].split(/\s+/)
  cols = cols.map(c => c.trim())

  const distAmt = parseNumToken(cols[3] ?? "")
  const taxAmt = parseNumToken(cols[4] ?? "")
  return {
    rowCount: lines.length,
    form: {
      ref_date:     parseDateToken(cols[0] ?? ""),
      pay_date:     parseDateToken(cols[1] ?? ""),
      dist_rate:    parseNumToken(cols[2] ?? ""),
      dist_amt:     distAmt ? Number(distAmt).toLocaleString("ko-KR") : "",
      tax_base_amt: taxAmt ? Number(taxAmt).toLocaleString("ko-KR") : "",
    },
  }
}

/** 지급 이력 행 → 입력값 (수정 모드 초기값) */
function rowToForm(r: EtfDividendRow): DivFormState {
  return {
    ref_date:     r.ref_date,
    pay_date:     r.pay_date ?? "",
    dist_rate:    String(r.dist_rate),
    dist_amt:     r.dist_amt.toLocaleString("ko-KR"),
    tax_base_amt: r.tax_base_amt.toLocaleString("ko-KR"),
  }
}

/**
 * 분배금 추가·수정 인라인 폼 — 주식 투자·연금투자 시뮬레이션의 분배금 팝업 공용.
 *
 * editRow 가 없으면 추가, 있으면 그 행을 수정한다. 초기값은 마운트 시 한 번만 읽으므로
 * 다른 행으로 바꿀 때는 부모가 key 를 바꿔 다시 마운트한다.
 * 저장 서버 액션(addEtfDividend·updateEtfDividend)은 admin 전용이다.
 */
export function DividendForm({ stockCode, editRow, onSaved, onCancel }: {
  stockCode: string
  editRow: EtfDividendRow | null
  onSaved: () => Promise<void> | void
  onCancel: () => void
}) {
  const [form, setForm]           = useState<DivFormState>(() => editRow ? rowToForm(editRow) : EMPTY_DIV_FORM)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [pasteInfo, setPasteInfo] = useState<string | null>(null)

  // 폼 안 어디에 붙여넣어도 한 행을 5개 입력칸으로 나눠 채운다
  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const text = e.clipboardData.getData("text")
    if (!text.trim()) return
    const parsed = parseDividendPaste(text)
    if (!parsed) return

    e.preventDefault()
    setForm(parsed.form)
    setError(null)

    const missing: string[] = []
    if (!parsed.form.ref_date) missing.push("지급기준일")
    if (!parsed.form.pay_date) missing.push("실지급일")

    if (missing.length > 0) {
      setPasteInfo(`붙여넣기 완료 — ${missing.join("·")}은(는) 형식을 알아보지 못해 비워뒀습니다.`)
    } else if (parsed.rowCount > 1) {
      setPasteInfo(`${parsed.rowCount}행 중 첫 행만 입력했습니다.`)
    } else {
      setPasteInfo("붙여넣기 완료")
    }
  }

  async function handleSave() {
    if (!form.ref_date) { setError("지급기준일을 입력하세요."); return }
    setSaving(true)
    setError(null)
    const values = {
      stock_code:   stockCode,
      ref_date:     form.ref_date,
      pay_date:     form.pay_date || null,
      dist_rate:    form.dist_rate    === "" ? null : Number(form.dist_rate),
      dist_amt:     form.dist_amt     === "" ? null : Number(form.dist_amt.replace(/,/g, "")),
      tax_base_amt: form.tax_base_amt === "" ? null : Number(form.tax_base_amt.replace(/,/g, "")),
    }
    try {
      if (editRow) await updateEtfDividend({ ...values, orig_ref_date: editRow.ref_date })
      else         await addEtfDividend(values)
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : editRow ? "분배금을 수정하지 못했습니다." : "분배금을 추가하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400"

  return (
    <div className="mt-2 p-3 bg-amber-50/60 border border-amber-200 rounded-lg" onPaste={handlePaste}>
      <p className="text-xs font-semibold text-amber-800 mb-1">
        {editRow ? `분배금 수정 — ${editRow.ref_date}` : "분배금 추가"}
      </p>
      <p className="text-xs text-gray-500 mb-2">
        엑셀에서 복사한 행을 이 영역 아무 곳에나 붙여넣으면 자동으로 나뉩니다 —
        <span className="ml-1 font-mono text-gray-600">26.08.14 ⇥ 26.08.19 ⇥ 1.36% ⇥ 270 ⇥ 3</span>
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">지급기준일 <span className="text-red-400">*</span></label>
          <input
            type="date"
            className={inputCls}
            value={form.ref_date}
            onChange={e => setForm(f => ({ ...f, ref_date: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">실지급일</label>
          <input
            type="date"
            className={inputCls}
            value={form.pay_date}
            onChange={e => setForm(f => ({ ...f, pay_date: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">분배율(%)</label>
          <input
            type="text" inputMode="decimal" placeholder="1.53"
            className={`${inputCls} text-right`}
            value={form.dist_rate}
            onChange={e => setForm(f => ({ ...f, dist_rate: e.target.value.replace(/[^0-9.]/g, "") }))}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">주당 분배금(원)</label>
          <input
            type="text" inputMode="numeric" placeholder="323"
            className={`${inputCls} text-right`}
            value={form.dist_amt}
            onChange={e => {
              const raw = e.target.value.replace(/[^0-9]/g, "")
              setForm(f => ({ ...f, dist_amt: raw ? Number(raw).toLocaleString("ko-KR") : "" }))
            }}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">과세표준액(원)</label>
          <input
            type="text" inputMode="numeric" placeholder="1"
            className={`${inputCls} text-right`}
            value={form.tax_base_amt}
            onChange={e => {
              const raw = e.target.value.replace(/[^0-9]/g, "")
              setForm(f => ({ ...f, tax_base_amt: raw ? Number(raw).toLocaleString("ko-KR") : "" }))
            }}
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      {!error && pasteInfo && <p className="text-xs text-emerald-600 mt-2">{pasteInfo}</p>}

      <div className="flex justify-end gap-2 mt-3">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >취소</button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-xs font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50"
        >{saving ? "저장 중..." : "저장"}</button>
      </div>
    </div>
  )
}
