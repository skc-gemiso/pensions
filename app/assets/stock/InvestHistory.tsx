"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import RichEditor from "@/components/RichEditor"
import { getRefList, addRef, updateRef, deleteRef, type Shopping } from "@/app/shopping/actions"
import { REF_GROUPS } from "@/app/shopping/ref-groups"

// 이 화면이 다루는 구분. my_shopping(item_type='ref') 을 메뉴끼리 나눠 쓰고 category 로 가른다
const GROUP = "stock" as const

type FormData = { product_nm: string; content: string }

const emptyForm = (): FormData => ({ product_nm: "", content: "" })

/**
 * 투자 이력 — 구분·제목·등록일·내용만 다룬다 (첨부파일 없음).
 *
 * 목록을 좌측 패널 대신 **상단 콤보박스**로 올려 본문이 화면 전체 너비를 쓴다.
 * 구분은 화면에서 고르지 않는다. 이 화면에서 쓴 글은 항상 `stock` 이다.
 */
export default function InvestHistory() {
  const [list, setList]             = useState<Shopping[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading]       = useState(true)
  const [mode, setMode]             = useState<"view" | "edit" | "add">("view")
  const [form, setForm]             = useState<FormData>(emptyForm())
  const [saving, setSaving]         = useState(false)

  // 목록에서 끌어온다 — 저장 후 재조회해도 선택이 유지된다
  const selected = useMemo(() => list.find(r => r.id === selectedId) ?? null, [list, selectedId])

  // keepId: 재조회 후 선택할 id. undefined 면 기존 선택 유지(없으면 첫 항목)
  const load = useCallback(async (keepId?: number) => {
    setLoading(true)
    try {
      const rows = await getRefList(GROUP)
      setList(rows)
      setSelectedId(prev => {
        const want = keepId ?? prev
        return rows.some(r => r.id === want) ? want! : (rows[0]?.id ?? null)
      })
      return rows
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // 폼은 입력 모드로 들어갈 때만 채운다 — 선택이 바뀔 때 맞춰줄 필요가 없다
  function startAdd() {
    setForm(emptyForm())
    setMode("add")
  }

  function startEdit() {
    if (!selected) return
    setForm({ product_nm: selected.product_nm, content: selected.content ?? "" })
    setMode("edit")
  }

  async function handleSave() {
    if (!form.product_nm.trim()) { alert("제목을 입력하세요."); return }
    setSaving(true)
    try {
      const data = { product_nm: form.product_nm, content: form.content || null }
      if (mode === "add") {
        const newId = await addRef({ group: GROUP, ...data })
        setMode("view")
        await load(newId)
      } else if (selected) {
        await updateRef(selected.id, data)
        setMode("view")
        await load(selected.id)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selected || !confirm(`"${selected.product_nm}" 을(를) 삭제하시겠습니까?`)) return
    await deleteRef(selected.id)
    setMode("view")
    await load(-1)   // 지운 항목은 목록에 없다 → 첫 항목으로 떨어진다
  }

  const set = (k: keyof FormData, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const isFormMode = mode === "edit" || mode === "add"

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 상단 바 — 목록 콤보박스 + 조작 버튼 */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-800 whitespace-nowrap">{REF_GROUPS[GROUP]}</h2>

        {mode === "add" ? (
          <span className="flex-1 min-w-48 text-sm text-blue-600 font-medium">새 항목 작성 중</span>
        ) : (
          <select
            value={selectedId ?? ""}
            onChange={(e) => { setSelectedId(e.target.value ? Number(e.target.value) : null); setMode("view") }}
            disabled={loading || list.length === 0}
            className="flex-1 min-w-48 max-w-xl px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:text-gray-400"
          >
            {list.length === 0 && <option value="">{loading ? "로딩 중..." : "항목이 없습니다"}</option>}
            {list.map((r) => (
              <option key={r.id} value={r.id}>
                {r.created_at?.slice(0, 10)} · {r.product_nm}
              </option>
            ))}
          </select>
        )}

        <span className="text-xs text-gray-400 whitespace-nowrap">{list.length}건</span>

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

      {/* 본문 — 화면 전체 너비 */}
      <div className="p-5 min-h-[620px]">
        {!selected && !isFormMode ? (
          <div className="flex flex-col items-center justify-center h-[560px] gap-3">
            <p className="text-sm text-gray-400">
              {loading ? "로딩 중..." : "항목이 없습니다. 새 항목을 추가하세요"}
            </p>
            {!loading && <button onClick={startAdd} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ 추가</button>}
          </div>
        ) : isFormMode ? (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-3">
                <label className="block text-xs text-gray-500 mb-1">제목</label>
                <input
                  type="text"
                  value={form.product_nm}
                  onChange={(e) => set("product_nm", e.target.value)}
                  placeholder="제목을 입력하세요"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 bg-white focus:outline-none focus:border-blue-500 placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">구분</label>
                <p className="px-3 py-2 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg">{REF_GROUPS[GROUP]}</p>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">내용</label>
              <RichEditor value={form.content} onChange={(html) => set("content", html)} minHeight={470} />
            </div>
          </div>
        ) : selected && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap border-b border-gray-100 pb-3">
              <h3 className="font-semibold text-gray-800 text-base">{selected.product_nm}</h3>
              <span className="text-xs text-gray-500 flex items-center gap-3 whitespace-nowrap">
                <span>구분 <span className="text-gray-800">{REF_GROUPS[GROUP]}</span></span>
                <span>등록일 <span className="text-gray-800">{selected.created_at?.slice(0, 10)}</span></span>
              </span>
            </div>
            {selected.content ? (
              <div
                className="rich-content text-sm text-gray-800 bg-gray-50 rounded-lg p-4 min-h-[500px]"
                dangerouslySetInnerHTML={{ __html: selected.content }}
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
