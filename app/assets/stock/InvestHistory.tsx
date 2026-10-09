"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import RichEditor from "@/components/RichEditor"
import {
  getHistoryList, addHistory, updateHistory, deleteHistory, type History,
} from "./actions"
import { HISTORY_CATEGORIES, HISTORY_CATEGORY_KEYS, type HistoryCategory } from "./history-categories"

const todayISO = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
})()

type Form = { category: HistoryCategory; t_date: string; title: string; contents: string }

const emptyForm = (): Form => ({ category: "stock", t_date: todayISO, title: "", contents: "" })

const label = (c: string) => HISTORY_CATEGORIES[c as HistoryCategory] ?? c

/**
 * 투자 이력 — `my_history` 전용 테이블을 쓴다.
 *
 * 쇼핑 참고 자료(`my_shopping`)에서 분리됐다. 구분(`category`)은 메뉴를 가르는 값이 아니라
 * 글의 성격(주식·연금)이라 등록·수정할 때 직접 고른다.
 * 목록을 상단 콤보박스로 올려 본문이 화면 전체 너비를 쓴다.
 */
export default function InvestHistory() {
  const [list, setList]             = useState<History[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading]       = useState(true)
  const [mode, setMode]             = useState<"view" | "edit" | "add">("view")
  const [form, setForm]             = useState<Form>(emptyForm())
  const [saving, setSaving]         = useState(false)
  const [filter, setFilter]         = useState<"" | HistoryCategory>("")

  const shown    = useMemo(() => filter ? list.filter(r => r.category === filter) : list, [list, filter])
  const selected = useMemo(() => list.find(r => r.id === selectedId) ?? null, [list, selectedId])

  // keepId: 재조회 후 선택할 id. undefined 면 기존 선택 유지(없으면 첫 항목)
  const load = useCallback(async (keepId?: number) => {
    setLoading(true)
    try {
      const rows = await getHistoryList()
      setList(rows)
      setSelectedId(prev => {
        const want = keepId ?? prev
        return rows.some(r => r.id === want) ? want! : (rows[0]?.id ?? null)
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // 폼은 입력 모드로 들어갈 때만 채운다
  function startAdd() {
    setForm({ ...emptyForm(), category: filter || "stock" })
    setMode("add")
  }

  function startEdit() {
    if (!selected) return
    setForm({
      category: (HISTORY_CATEGORY_KEYS.includes(selected.category as HistoryCategory)
                  ? selected.category : "stock") as HistoryCategory,
      t_date:   selected.t_date ?? todayISO,
      title:    selected.title,
      contents: selected.contents ?? "",
    })
    setMode("edit")
  }

  async function handleSave() {
    if (!form.title.trim())  { alert("제목을 입력하세요."); return }
    if (!form.t_date)        { alert("등록일자를 선택하세요."); return }
    setSaving(true)
    try {
      const data = {
        category: form.category,
        t_date:   form.t_date,
        title:    form.title,
        contents: form.contents || null,
      }
      if (mode === "add") {
        const newId = await addHistory(data)
        setMode("view")
        await load(newId)
      } else if (selected) {
        await updateHistory(selected.id, data)
        setMode("view")
        await load(selected.id)
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 실패")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selected || !confirm(`"${selected.title}" 을(를) 삭제하시겠습니까?`)) return
    await deleteHistory(selected.id)
    setMode("view")
    await load(-1)   // 지운 항목은 목록에 없다 → 첫 항목으로 떨어진다
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }))
  const isFormMode = mode === "edit" || mode === "add"

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 상단 바 — 구분 필터 + 목록 콤보박스 + 조작 버튼 */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-800 whitespace-nowrap">투자 이력</h2>

        {mode === "add" ? (
          <span className="flex-1 min-w-48 text-sm text-blue-600 font-medium">새 항목 작성 중</span>
        ) : (
          <>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as "" | HistoryCategory)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">구분 전체</option>
              {HISTORY_CATEGORY_KEYS.map(k => <option key={k} value={k}>{HISTORY_CATEGORIES[k]}</option>)}
            </select>
            <select
              value={shown.some(r => r.id === selectedId) ? String(selectedId) : ""}
              onChange={(e) => { setSelectedId(e.target.value ? Number(e.target.value) : null); setMode("view") }}
              disabled={loading || shown.length === 0}
              className="flex-1 min-w-48 max-w-xl px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:text-gray-400"
            >
              {shown.length === 0 && <option value="">{loading ? "로딩 중..." : "항목이 없습니다"}</option>}
              {shown.map(r => (
                <option key={r.id} value={r.id}>
                  {r.t_date ?? "-"} · {label(r.category)} · {r.title}
                </option>
              ))}
            </select>
          </>
        )}

        <span className="text-xs text-gray-400 whitespace-nowrap">{shown.length}건</span>

        <div className="flex gap-2 ml-auto">
          {!isFormMode && (
            <>
              <button onClick={startAdd} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">+ 추가</button>
              <button onClick={startEdit} disabled={!selected} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200 disabled:opacity-40">편집</button>
              <button onClick={handleDelete} disabled={!selected} className="px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded-lg hover:bg-red-100 disabled:opacity-40">삭제</button>
            </>
          )}
          {isFormMode && (
            <>
              <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? "저장 중…" : "저장"}
              </button>
              <button onClick={() => setMode("view")} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200">취소</button>
            </>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="p-5 min-h-[620px]">
        {!selected && !isFormMode ? (
          <div className="flex flex-col items-center justify-center h-[560px] gap-3">
            <p className="text-sm text-gray-400">{loading ? "로딩 중..." : "항목이 없습니다"}</p>
            {!loading && <button onClick={startAdd} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ 추가</button>}
          </div>
        ) : isFormMode ? (
          <div className="space-y-3">
            <div className="grid grid-cols-6 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">구분</label>
                <select
                  value={form.category}
                  onChange={(e) => set("category", e.target.value as HistoryCategory)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                >
                  {HISTORY_CATEGORY_KEYS.map(k => <option key={k} value={k}>{HISTORY_CATEGORIES[k]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">등록일자</label>
                <input
                  type="date"
                  value={form.t_date}
                  onChange={(e) => set("t_date", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="col-span-4">
                <label className="block text-xs text-gray-500 mb-1">제목</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="제목을 입력하세요"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 bg-white focus:outline-none focus:border-blue-500 placeholder:text-gray-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">내용</label>
              <RichEditor value={form.contents} onChange={(html) => set("contents", html)} minHeight={470} />
            </div>
          </div>
        ) : selected && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap border-b border-gray-100 pb-3">
              <h3 className="font-semibold text-gray-800 text-base">{selected.title}</h3>
              <span className="text-xs text-gray-500 flex items-center gap-3 whitespace-nowrap">
                <span>구분 <span className="text-gray-800">{label(selected.category)}</span></span>
                <span>등록일자 <span className="text-gray-800">{selected.t_date ?? "-"}</span></span>
              </span>
            </div>
            {selected.contents ? (
              <div
                className="rich-content text-sm text-gray-800 bg-gray-50 rounded-lg p-4 min-h-[500px]"
                dangerouslySetInnerHTML={{ __html: selected.contents }}
              />
            ) : (
              <p className="text-sm text-gray-400 py-8 text-center">내용이 없습니다</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
