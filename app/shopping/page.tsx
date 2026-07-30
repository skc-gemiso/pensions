"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import AppLayout from "@/components/AppLayout"
import RichEditor from "@/components/RichEditor"
import { fmt } from "@/lib/fmt"
import {
  getShoppingList, getShoppingFiles, addShopping, updateShopping, deleteShopping,
  getRefList, getRefFiles, addRef, updateRef, deleteRef,
  deleteShoppingFile, getCardItems,
  type Shopping, type ShoppingFile, type CardItem,
} from "./actions"

// ── 상수 ──────────────────────────────────────────────────────────────────────

const SHOPPING_CATEGORIES = [
  { value: "domestic", label: "국내" },
  { value: "overseas", label: "국외" },
  { value: "phone",    label: "휴대폰" },
  { value: "laptop",   label: "노트북" },
]


const CATEGORY_BADGE: Record<string, string> = {
  domestic: "bg-blue-50 text-blue-600",
  overseas: "bg-purple-50 text-purple-600",
  phone:    "bg-green-50 text-green-600",
  laptop:   "bg-orange-50 text-orange-600",
  etc:      "bg-gray-100 text-gray-500",
}

function categoryLabel(value: string, list: { value: string; label: string }[]) {
  return list.find((c) => c.value === value)?.label ?? value
}

// ── 파일 업로드 헬퍼 ──────────────────────────────────────────────────────────

async function uploadFiles(files: File[], refType: string, refId: number): Promise<void> {
  for (const file of files) {
    const fd = new FormData()
    fd.append("file", file)
    fd.append("refType", refType)
    fd.append("refId", String(refId))
    await fetch("/api/shopping/upload", { method: "POST", body: fd })
  }
}

// ── 파일 목록 컴포넌트 ────────────────────────────────────────────────────────

function FileList({ files, onDelete, deletable = false }: { files: ShoppingFile[]; onDelete: (id: number) => void; deletable?: boolean }) {
  if (files.length === 0) return <p className="text-xs text-gray-400">첨부파일 없음</p>
  return (
    <ul className="flex flex-wrap gap-3">
      {files.map((f) => (
        <li key={f.id} className="flex flex-col items-center gap-1">
          {f.mime_type?.startsWith("image/") ? (
            <a href={f.signed_url} target="_blank" rel="noreferrer">
              <img src={f.signed_url} alt={f.file_nm} className="h-20 w-20 rounded border border-gray-200 object-cover" />
            </a>
          ) : (
            <a href={f.signed_url} target="_blank" rel="noreferrer"
              className="flex items-center justify-center h-20 w-20 rounded border border-gray-200 bg-gray-50 text-[10px] text-blue-600 text-center p-1 break-all hover:bg-gray-100">
              {f.file_nm}
            </a>
          )}
          {deletable && (
            <button
              onClick={() => onDelete(f.id)}
              className="px-3 py-0.5 text-xs text-red-500 border border-red-300 rounded hover:bg-red-50 transition-colors"
            >삭제</button>
          )}
        </li>
      ))}
    </ul>
  )
}

// ── 파일 드롭/붙여넣기 영역 ───────────────────────────────────────────────────

function FileDropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    onFiles(Array.from(e.dataTransfer.files))
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items)
    const files = items.flatMap((i) => (i.kind === "file" ? [i.getAsFile()!] : [])).filter(Boolean)
    if (files.length > 0) onFiles(files)
  }

  return (
    <div
      className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 transition-colors"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onPaste={handlePaste}
      onClick={() => inputRef.current?.click()}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
    >
      <p className="text-xs text-gray-400">파일 선택, 드래그하거나 이미지를 붙여넣기 (Ctrl+V)</p>
      <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onFiles(Array.from(e.target.files ?? []))} />
    </div>
  )
}

// ── 구매 목록 패널 ────────────────────────────────────────────────────────────

type ShoppingFormData = {
  category: string
  purchase_date: string
  product_nm: string
  card_item_id: string
  original_price: string
  purchase_price: string
  purchase_place: string
  content: string
}

const emptyShoppingForm = (): ShoppingFormData => ({
  category: "domestic",
  purchase_date: new Date().toISOString().slice(0, 10),
  product_nm: "",
  card_item_id: "",
  original_price: "",
  purchase_price: "",
  purchase_place: "",
  content: "",
})

function ShoppingDetail({
  item,
  cards,
  onSaved,
  onDeleted,
}: {
  item: Shopping | null
  cards: CardItem[]
  onSaved: () => void
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<ShoppingFormData>(emptyShoppingForm())
  const [files, setFiles] = useState<ShoppingFile[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEditing(false)
    setAdding(false)
    setPendingFiles([])
    if (item) {
      setForm({
        category: item.category,
        purchase_date: item.purchase_date?.slice(0, 10) ?? "",
        product_nm: item.product_nm,
        card_item_id: item.card_item_id ? String(item.card_item_id) : "",
        original_price: item.original_price != null ? String(item.original_price) : "",
        purchase_price: item.purchase_price != null ? String(item.purchase_price) : "",
        purchase_place: item.purchase_place ?? "",
        content: item.content ?? "",
      })
      getShoppingFiles(item.id).then(setFiles)
    } else {
      setFiles([])
    }
  }, [item])

  function startAdd() {
    setForm(emptyShoppingForm())
    setPendingFiles([])
    setAdding(true)
    setEditing(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const data = {
        category: form.category,
        purchase_date: form.purchase_date,
        product_nm: form.product_nm,
        card_item_id: form.card_item_id ? Number(form.card_item_id) : null,
        original_price: form.original_price ? Number(form.original_price) : null,
        purchase_price: form.purchase_price ? Number(form.purchase_price) : null,
        purchase_place: form.purchase_place || null,
        content: form.content || null,
      }
      if (adding) {
        const newId = await addShopping(data)
        if (pendingFiles.length > 0) await uploadFiles(pendingFiles, "shopping", newId)
      } else if (item) {
        await updateShopping(item.id, data)
        if (pendingFiles.length > 0) await uploadFiles(pendingFiles, "shopping", item.id)
      }
      setEditing(false)
      setAdding(false)
      setPendingFiles([])
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!item || !confirm(`"${item.product_nm}" 을(를) 삭제하시겠습니까?`)) return
    await deleteShopping(item.id)
    onDeleted()
  }

  async function handleFileDelete(fileId: number) {
    await deleteShoppingFile(fileId)
    if (item) setFiles(await getShoppingFiles(item.id))
  }

  const set = (k: keyof ShoppingFormData, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const isFormMode = editing || adding

  if (!item && !adding) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-gray-400">좌측에서 항목을 선택하거나 새 항목을 추가하세요</p>
        <button onClick={startAdd} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          + 추가
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 상단 버튼 */}
      <div className="flex items-center justify-between mb-4">
        {isFormMode ? (
          <input
            type="text"
            value={form.product_nm}
            onChange={(e) => set("product_nm", e.target.value)}
            placeholder="제품명을 입력하세요"
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

      {/* 폼 / 상세 */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {isFormMode ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">카테고리</label>
                <select value={form.category} onChange={(e) => set("category", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-500">
                  {SHOPPING_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">구매일자</label>
                <input type="date" value={form.purchase_date} onChange={(e) => set("purchase_date", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">구매처</label>
                <input type="text" value={form.purchase_place} onChange={(e) => set("purchase_place", e.target.value)}
                  placeholder="구매처"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-500 placeholder:text-gray-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">결제수단</label>
                <select value={form.card_item_id} onChange={(e) => set("card_item_id", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-500">
                  <option value="">선택 안 함</option>
                  {cards.map((c) => <option key={c.id} value={c.id}>{c.item_nm}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">제품가격 (원)</label>
                <input type="text" inputMode="numeric"
                  value={form.original_price ? Number(form.original_price).toLocaleString("ko-KR") : ""}
                  onChange={(e) => set("original_price", e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right text-gray-900 bg-white focus:outline-none focus:border-blue-500 placeholder:text-gray-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">구입가격 (원)</label>
                <input type="text" inputMode="numeric"
                  value={form.purchase_price ? Number(form.purchase_price).toLocaleString("ko-KR") : ""}
                  onChange={(e) => set("purchase_price", e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right text-gray-900 bg-white focus:outline-none focus:border-blue-500 placeholder:text-gray-400" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">내용</label>
              <RichEditor value={form.content} onChange={(html) => set("content", html)} minHeight={230} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">첨부파일</label>
              {files.length > 0 && (
                <div className="mb-2">
                  <FileList files={files} onDelete={handleFileDelete} deletable />
                </div>
              )}
              <FileDropZone onFiles={(f) => setPendingFiles((p) => [...p, ...f])} />
              {pendingFiles.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {pendingFiles.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="truncate">{f.name}</span>
                      <button onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400">✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          item && (
            <>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="py-2 pr-2 text-xs text-gray-500 whitespace-nowrap">카테고리</td>
                    <td className="py-2">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded ${CATEGORY_BADGE[item.category] ?? "bg-gray-100 text-gray-500"}`}>
                        {categoryLabel(item.category, SHOPPING_CATEGORIES)}
                      </span>
                    </td>
                    <td className="py-2 pl-3 pr-2 text-xs text-gray-500 whitespace-nowrap">구매일자</td>
                    <td className="py-2 text-gray-800 whitespace-nowrap">{item.purchase_date?.slice(0, 10)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 text-xs text-gray-500">구매처</td>
                    <td className="py-2 text-gray-800">{item.purchase_place ?? "—"}</td>
                    <td className="py-2 pl-4 pr-3 text-xs text-gray-500">결제수단</td>
                    <td className="py-2 text-gray-800">{item.card_item_nm ?? "—"}</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 text-xs text-gray-500">제품가격</td>
                    <td className="py-2 text-gray-800">{item.original_price != null ? `${fmt(item.original_price)}원` : "—"}</td>
                    <td className="py-2 pl-4 pr-3 text-xs text-gray-500">구입가격</td>
                    <td className="py-2 text-gray-800">{item.purchase_price != null ? `${fmt(item.purchase_price)}원` : "—"}</td>
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
              <div>
                <p className="text-xs text-gray-500 mb-2">첨부파일</p>
                <FileList files={files} onDelete={handleFileDelete} />
              </div>
            </>
          )
        )}
      </div>
    </div>
  )
}

// ── 참고 자료 패널 ────────────────────────────────────────────────────────────

type RefFormData = {
  product_nm: string
  purchase_place: string
  original_price: string
  content: string
}

const emptyRefForm = (): RefFormData => ({
  product_nm: "",
  purchase_place: "",
  original_price: "",
  content: "",
})

function RefDetail({
  item,
  onSaved,
  onDeleted,
}: {
  item: Shopping | null
  onSaved: () => void
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<RefFormData>(emptyRefForm())
  const [files, setFiles] = useState<ShoppingFile[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEditing(false)
    setAdding(false)
    setPendingFiles([])
    if (item) {
      setForm({
        product_nm: item.product_nm,
        purchase_place: item.purchase_place ?? "",
        original_price: item.original_price != null ? String(item.original_price) : "",
        content: item.content ?? "",
      })
      getRefFiles(item.id).then(setFiles)
    } else {
      setFiles([])
    }
  }, [item])

  function startAdd() {
    setForm(emptyRefForm())
    setPendingFiles([])
    setAdding(true)
    setEditing(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const data = {
        product_nm: form.product_nm,
        purchase_place: form.purchase_place || null,
        original_price: form.original_price ? Number(form.original_price) : null,
        content: form.content || null,
      }
      if (adding) {
        const newId = await addRef(data)
        if (pendingFiles.length > 0) await uploadFiles(pendingFiles, "ref", newId)
      } else if (item) {
        await updateRef(item.id, data)
        if (pendingFiles.length > 0) await uploadFiles(pendingFiles, "ref", item.id)
      }
      setEditing(false)
      setAdding(false)
      setPendingFiles([])
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

  async function handleFileDelete(fileId: number) {
    await deleteShoppingFile(fileId)
    if (item) setFiles(await getRefFiles(item.id))
  }

  const set = (k: keyof RefFormData, v: string) => setForm((f) => ({ ...f, [k]: v }))
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
            placeholder="제품명을 입력하세요"
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">구매처</label>
                <input type="text" value={form.purchase_place} onChange={(e) => set("purchase_place", e.target.value)}
                  placeholder="구매처"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-500 placeholder:text-gray-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">제품가격 (원)</label>
                <input type="text" inputMode="numeric"
                  value={form.original_price ? Number(form.original_price).toLocaleString("ko-KR") : ""}
                  onChange={(e) => set("original_price", e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right text-gray-900 bg-white focus:outline-none focus:border-blue-500 placeholder:text-gray-400" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">내용</label>
              <RichEditor value={form.content} onChange={(html) => set("content", html)} minHeight={370} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">첨부파일</label>
              {files.length > 0 && (
                <div className="mb-2">
                  <FileList files={files} onDelete={handleFileDelete} />
                </div>
              )}
              <FileDropZone onFiles={(f) => setPendingFiles((p) => [...p, ...f])} />
              {pendingFiles.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {pendingFiles.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="truncate">{f.name}</span>
                      <button onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400">✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          item && (
            <>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">등록일</td>
                    <td className="py-2 text-gray-800 whitespace-nowrap" colSpan={3}>{item.created_at?.slice(0, 10)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 text-xs text-gray-500">구매처</td>
                    <td className="py-2 text-gray-800">{item.purchase_place ?? "—"}</td>
                    <td className="py-2 pl-4 pr-3 text-xs text-gray-500">제품가격</td>
                    <td className="py-2 text-gray-800">{item.original_price != null ? `${fmt(item.original_price)}원` : "—"}</td>
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
              <div>
                <p className="text-xs text-gray-500 mb-2">첨부파일</p>
                <FileList files={files} onDelete={handleFileDelete} />
              </div>
            </>
          )
        )}
      </div>
    </div>
  )
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────

type Mode = "shopping" | "ref"
type CategoryFilter = "all" | "domestic" | "overseas" | "phone" | "laptop"

export default function ShoppingPage() {
  const [mode, setMode] = useState<Mode>("shopping")
  const [filter, setFilter] = useState<CategoryFilter>("all")

  const [shoppingList, setShoppingList] = useState<Shopping[]>([])
  const [selectedShopping, setSelectedShopping] = useState<Shopping | null>(null)

  const [refList, setRefList] = useState<Shopping[]>([])
  const [selectedRef, setSelectedRef] = useState<Shopping | null>(null)

  const [cards, setCards] = useState<CardItem[]>([])
  const [loading, setLoading] = useState(false)

  const loadShopping = useCallback(async (cat?: string) => {
    setLoading(true)
    try {
      const list = await getShoppingList(cat === "all" || !cat ? undefined : cat)
      setShoppingList(list)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadRef = useCallback(async () => {
    setLoading(true)
    try {
      setRefList(await getRefList())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { getCardItems().then(setCards) }, [])

  useEffect(() => {
    if (mode === "shopping") loadShopping(filter)
    else loadRef()
  }, [mode, filter, loadShopping, loadRef])

  function handleShoppingSaved() {
    loadShopping(filter)
    setSelectedShopping(null)
  }

  function handleShoppingDeleted() {
    setSelectedShopping(null)
    loadShopping(filter)
  }

  function handleRefSaved() {
    loadRef()
    setSelectedRef(null)
  }

  function handleRefDeleted() {
    setSelectedRef(null)
    loadRef()
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        {/* 모드 토글 */}
        <div className="flex items-center gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
          <button
            onClick={() => { setMode("shopping"); setSelectedShopping(null) }}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${mode === "shopping" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            구매 목록
          </button>
          <button
            onClick={() => { setMode("ref"); setSelectedRef(null) }}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${mode === "ref" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            참고 자료
          </button>
        </div>

        {/* 구매 목록 필터 */}
        {mode === "shopping" && (
          <div className="flex gap-2 mb-4">
            {([
              { value: "all", label: "전체" },
              ...SHOPPING_CATEGORIES,
            ] as { value: string; label: string }[]).map((c) => (
              <button
                key={c.value}
                onClick={() => setFilter(c.value as CategoryFilter)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  filter === c.value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {/* 2-panel */}
        <div className="flex gap-4 h-[calc(100vh-200px)]">
          {/* 좌측 목록 */}
          <div className="w-[27rem] flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-sm font-semibold text-gray-600">
                {mode === "shopping" ? "구매 목록" : "참고 자료"} ({mode === "shopping" ? shoppingList.length : refList.length}건)
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading && <p className="text-xs text-gray-400 text-center py-8">로딩 중…</p>}

              {mode === "shopping" && !loading && shoppingList.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-8">항목이 없습니다</p>
              )}
              {mode === "shopping" && shoppingList.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedShopping(s)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-blue-50 transition-colors ${selectedShopping?.id === s.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`inline-block px-1.5 py-0.5 text-sm rounded ${CATEGORY_BADGE[s.category] ?? "bg-gray-100 text-gray-500"}`}>
                      {categoryLabel(s.category, SHOPPING_CATEGORIES)}
                    </span>
                    <span className="text-sm text-gray-400">{s.purchase_date?.slice(0, 10)}</span>
                    {s.purchase_price != null && (
                      <span className="ml-auto text-sm text-gray-500">{fmt(s.purchase_price)}원</span>
                    )}
                  </div>
                  <p className="text-base text-gray-800 truncate">{s.product_nm}</p>
                </button>
              ))}

              {mode === "ref" && !loading && refList.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-8">항목이 없습니다</p>
              )}
              {mode === "ref" && refList.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRef(r)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-blue-50 transition-colors ${selectedRef?.id === r.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm text-gray-400">{r.created_at?.slice(0, 10)}</span>
                    {r.original_price != null && (
                      <span className="ml-auto text-sm text-gray-500">{fmt(r.original_price)}원</span>
                    )}
                  </div>
                  <p className="text-base text-gray-800 truncate">{r.product_nm}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 우측 상세 */}
          <div className="flex-1 bg-white rounded-xl border border-gray-200 p-5 overflow-hidden">
            {mode === "shopping" ? (
              <ShoppingDetail
                item={selectedShopping}
                cards={cards}
                onSaved={handleShoppingSaved}
                onDeleted={handleShoppingDeleted}
              />
            ) : (
              <RefDetail
                item={selectedRef}
                onSaved={handleRefSaved}
                onDeleted={handleRefDeleted}
              />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
