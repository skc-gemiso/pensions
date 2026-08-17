"use client"

/**
 * 공용 도움말 모달.
 *
 * 아이콘은 화면 전체에서 파란 `!` 원 하나로 통일하고 크기만 위치에 따라 바꾼다.
 *   variant="page"    페이지 제목 옆 — 24px
 *   variant="section" 카드·표 제목 옆 — 16px
 *
 * 본문은 탭 배열로 넘긴다. 구성 프리미티브(H / Box / ColTable)를 함께 export 하므로
 * 화면마다 같은 생김새로 내용만 채우면 된다.
 */

import { useState } from "react"
import { createPortal } from "react-dom"

export type HelpTab = { key: string; label: string; body: React.ReactNode }

/** 도움말 본문 소제목 */
export const H = ({ children }: { children: React.ReactNode }) =>
  <p className="font-semibold text-gray-900 mb-1.5">{children}</p>

/** 도움말 본문 박스 */
export const Box = ({ children, tone = "gray" }: {
  children: React.ReactNode
  tone?: "gray" | "amber" | "blue" | "emerald" | "red"
}) => (
  <div className={`rounded-xl p-4 border ${
    tone === "amber" ? "bg-amber-50 border-amber-200"
      : tone === "blue" ? "bg-blue-50 border-blue-200"
      : tone === "emerald" ? "bg-emerald-50 border-emerald-200"
      : tone === "red" ? "bg-red-50 border-red-200"
      : "bg-gray-50 border-gray-200"
  }`}>{children}</div>
)

/** 컬럼명 ↔ 뜻을 1:1로 보여주는 표 */
export const ColTable = ({ rows }: { rows: [string, React.ReactNode][] }) => (
  <table className="w-full text-xs">
    <tbody className="[&_td]:py-1.5 [&_td]:align-top [&_tr]:border-b [&_tr]:border-gray-200 [&_tr:last-child]:border-0">
      {rows.map(([col, desc], i) => (
        <tr key={i}>
          <td className="w-28 pr-2 font-medium text-gray-800 whitespace-nowrap">{col}</td>
          <td className="text-gray-600 leading-relaxed">{desc}</td>
        </tr>
      ))}
    </tbody>
  </table>
)

export default function HelpModal({ title, lead, tabs, variant = "section" }: {
  title: string
  lead?: React.ReactNode
  tabs: HelpTab[]
  variant?: "page" | "section"
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState(tabs[0].key)
  const current = tabs.find(t => t.key === tab) ?? tabs[0]
  const size = variant === "page" ? "w-6 h-6" : "w-4 h-4"

  return (
    <>
      <button
        type="button"
        onClick={() => { setTab(tabs[0].key); setOpen(true) }}
        title={`${title} 도움말`}
        className="inline-flex items-center justify-center flex-shrink-0 align-middle opacity-60 hover:opacity-100 transition-opacity"
      >
        <svg viewBox="0 0 24 24" className={size} fill="none">
          <circle cx="12" cy="12" r="10" stroke="#3B82F6" strokeWidth="2" fill="white" />
          <circle cx="12" cy="8" r="1.5" fill="#3B82F6" />
          <rect x="11" y="11" width="2" height="6" rx="1" fill="#3B82F6" />
        </svg>
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">{title}</h2>
                {lead && <p className="text-xs text-gray-500 mt-0.5">{lead}</p>}
              </div>
              <button type="button" onClick={() => setOpen(false)}
                className="text-gray-500 hover:text-gray-700 text-xl leading-none ml-4">×</button>
            </div>

            {tabs.length > 1 && (
              <div className="flex gap-1 px-6 pt-3 flex-shrink-0 flex-wrap">
                {tabs.map(t => (
                  <button key={t.key} type="button" onClick={() => setTab(t.key)}
                    className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                      tab === t.key ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"
                    }`}>{t.label}</button>
                ))}
              </div>
            )}

            <div className="overflow-y-auto px-6 py-4 space-y-4 text-sm">{current.body}</div>

            <div className="px-6 py-3 border-t border-gray-200 flex justify-end flex-shrink-0">
              <button type="button" onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                닫기
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
