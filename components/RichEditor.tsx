"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import { useEffect } from "react"

interface Props {
  value: string
  onChange: (html: string) => void
  minHeight?: number
}

export default function RichEditor({ value, onChange, minHeight = 150 }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ HTMLAttributes: { class: "rich-img" } }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange(html === "<p></p>" ? "" : html)
    },
    editorProps: {
      attributes: {
        class: "rich-editor-body focus:outline-none text-sm text-gray-900 px-3 py-2",
        style: `min-height:${minHeight}px`,
      },
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items ?? [])
        const imageItem = items.find((i) => i.type.startsWith("image/"))
        if (!imageItem) return false

        const file = imageItem.getAsFile()
        if (!file) return false

        const fd = new FormData()
        fd.append("file", file)
        fetch("/api/shopping/content-image", { method: "POST", body: fd })
          .then((r) => r.json())
          .then(({ url }: { url?: string }) => {
            if (!url) return
            const { schema } = view.state
            const node = schema.nodes.image.create({ src: url })
            const tr = view.state.tr.replaceSelectionWith(node)
            view.dispatch(tr)
          })
          .catch(() => {})

        return true
      },
    },
  })

  // 선택 항목 변경 시 에디터 내용 동기화
  useEffect(() => {
    if (!editor) return
    const next = value || ""
    if (editor.getHTML() !== next) {
      editor.commands.setContent(next)
    }
  }, [editor, value])

  return (
    <div className="border-2 border-gray-300 rounded-lg overflow-hidden focus-within:border-blue-400 bg-white">
      {/* 툴바 */}
      <div className="flex gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
        <ToolBtn active={editor?.isActive("bold") ?? false} onClick={() => editor?.chain().focus().toggleBold().run()} title="굵게 (Ctrl+B)">
          <strong>B</strong>
        </ToolBtn>
        <ToolBtn active={editor?.isActive("italic") ?? false} onClick={() => editor?.chain().focus().toggleItalic().run()} title="기울임 (Ctrl+I)">
          <em>I</em>
        </ToolBtn>
        <ToolBtn active={editor?.isActive("strike") ?? false} onClick={() => editor?.chain().focus().toggleStrike().run()} title="취소선">
          <s>S</s>
        </ToolBtn>
        <div className="w-px bg-gray-200 mx-1" />
        <ToolBtn active={editor?.isActive("bulletList") ?? false} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="글머리 기호">
          ≡
        </ToolBtn>
        <ToolBtn active={editor?.isActive("orderedList") ?? false} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="번호 목록">
          1.
        </ToolBtn>
        <div className="w-px bg-gray-200 mx-1" />
        <ToolBtn active={false} onClick={() => editor?.chain().focus().undo().run()} title="실행 취소 (Ctrl+Z)">
          ↩
        </ToolBtn>
        <ToolBtn active={false} onClick={() => editor?.chain().focus().redo().run()} title="다시 실행 (Ctrl+Y)">
          ↪
        </ToolBtn>
      </div>

      <EditorContent editor={editor} />

      <p className="px-3 pb-1.5 text-[10px] text-gray-400">이미지는 Ctrl+V로 붙여넣기</p>
    </div>
  )
}

function ToolBtn({
  children,
  active,
  onClick,
  title,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-7 h-7 text-xs rounded flex items-center justify-center transition-colors ${
        active ? "bg-blue-100 text-blue-600" : "text-gray-500 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  )
}
