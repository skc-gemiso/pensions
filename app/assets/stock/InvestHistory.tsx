"use client"

import { useCallback, useEffect, useState } from "react"
import RichEditor from "@/components/RichEditor"
import { getRefList, addRef, updateRef, deleteRef, type Shopping } from "@/app/shopping/actions"
import { REF_GROUPS } from "@/app/shopping/ref-groups"

// 이 화면이 다루는 구분. my_shopping(item_type='ref') 을 메뉴끼리 나눠 쓰고 category 로 가른다
const GROUP = "stock" as const

type FormData = { product_nm: string; content: string }

const emptyForm = (): FormData => ({ product_nm: "", content: "" })

/**
 * 투자 이력 — 쇼핑 「참고 자료」와 같은 좌측 목록 + 우측 상세 구조.
 * 첨부파일은 쓰지 않고 구분·제목·등록일·내용만 다룬다.
 * 구분은 화면에서 고르지 않는다. 이 화면에서 쓴 글은 항상 `stock` 이다.
 */
export default function InvestHistory() {
  const [list, setList]         = useState<Shopping[]>([])
  const [selected, setSelected] = useState<Shopping | null>(null)
  const [loading, setLoading]   = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setList(await getRefList(GROUP))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex gap-4 h-[680px]">
      {/* 좌측 목록 */}
      <div className="w-80 shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">
            {REF_GROUPS[GROUP]}
            <span className="ml-2 text-xs font-normal text-gray-400">{list.length}건</span>
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-8">로딩 중...</p>
          ) : list.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">항목이 없습니다</p>
          ) : (
            list.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-blue-50 transition-colors ${
                  selected?.id === r.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm text-gray-400">{r.created_at?.slice(0, 10)}</span>
                </div>
                <p className="text-base text-gray-800 truncate">{r.product_nm}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 우측 상세 */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 p-5 overflow-hidden">
        <Detail
          item={selected}
          onSaved={() => { load(); setSelected(null) }}
          onDeleted={() => { setSelected(null); load() }}
        />
      </div>
    </div>
  )
}

function Detail({
  item,
  onSaved,
  onDeleted,
}: {
  item: Shopping | null
  onSaved: () => void
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [adding, setAdding]   = useState(false)
  const [form, setForm]       = useState<FormData>(emptyForm())
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    setEditing(false)
    setAdding(false)
    if (item) setForm({ product_nm: item.product_nm, content: item.content ?? "" })
  }, [item])

  function startAdd() {
    setForm(emptyForm())
    setAdding(true)
    setEditing(false)
  }

  async function handleSave() {
    if (!form.product_nm.trim()) { alert("제목을 입력하세요."); return }
    setSaving(true)
    try {
      const data = { product_nm: form.product_nm, content: form.content || null }
      if (adding)      await addRef({ group: GROUP, ...data })
      else if (item)   await updateRef(item.id, data)
      setEditing(false)
      setAdding(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!item || !confirm(`"${item.product_nm}" 을(를) 삭제하시겠습니까?`)) return
    await deleteRef(item.id)
    onDeleted()
  }

  const set = (k: keyof FormData, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const isFormMode = editing || adding

  if (!item && !adding) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-gray-400">좌측에서 항목을 선택하거나 새 항목을 추가하세요</p>
        <button onClick={startAdd} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ 추가</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        {isFormMode ? (
          <input
            type="text"
            value={form.product_nm}
            onChange={(e) => set("product_nm", e.target.value)}
            placeholder="제목을 입력하세요"
            className="flex-1 mr-3 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-900 bg-white focus:outline-none focus:border-blue-500 placeholder:text-gray-400"
          />
        ) : (
          <h3 className="font-semibold text-gray-800 text-sm">{item?.product_nm}</h3>
        )}
        <div className="flex gap-2">
          {!isFormMode && (
            <>
              <button onClick={startAdd} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">+ 추가</button>
              <button onClick={() => setEditing(true)} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200">편집</button>
              <button onClick={handleDelete} className="px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded-lg hover:bg-red-100">삭제</button>
            </>
          )}
          {isFormMode && (
            <>
              <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? "저장 중…" : "저장"}
              </button>
              <button onClick={() => { setEditing(false); setAdding(false) }} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200">취소</button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {isFormMode ? (
          <>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">구분</td>
                  <td className="py-2 text-gray-800">{REF_GROUPS[GROUP]}</td>
                </tr>
              </tbody>
            </table>
            <div>
              <label className="block text-xs text-gray-500 mb-1">내용</label>
              <RichEditor value={form.content} onChange={(html) => set("content", html)} minHeight={430} />
            </div>
          </>
        ) : (
          item && (
            <>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">구분</td>
                    <td className="py-2 text-gray-800">{REF_GROUPS[GROUP]}</td>
                    <td className="py-2 pl-4 pr-3 text-xs text-gray-500 whitespace-nowrap">등록일</td>
                    <td className="py-2 text-gray-800 whitespace-nowrap">{item.created_at?.slice(0, 10)}</td>
                  </tr>
                </tbody>
              </table>
              {item.content && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">내용</p>
                  <div
                    className="rich-content text-sm text-gray-800 bg-gray-50 rounded-lg p-3"
                    dangerouslySetInnerHTML={{ __html: item.content }}
                  />
                </div>
              )}
            </>
          )
        )}
      </div>
    </div>
  )
}
