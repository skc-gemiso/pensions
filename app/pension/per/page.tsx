"use client"

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import AppLayout from "@/components/AppLayout"
import { fmt, fmtKRW, cc } from "@/lib/fmt"
import {
  getPerConfig, updatePerConfig, getPerOverview, getPerProjection,
  type PerConfig, type PerOverview, type PerProjection,
} from "./actions"
import { getProfile, updateProfile, type ProfileView } from "@/app/actions/profile"
import { RETIRE_RULE_LABEL, type RetireRule } from "@/lib/profile"

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"

function fmtYm(ym: string): string {
  const [y, m] = ym.split("-")
  return `${y}년 ${Number(m)}월`
}

// ─────────────────────────────────────────────
// 도움말 모달 (연금투자 시뮬레이션과 같은 ! 아이콘)
// ─────────────────────────────────────────────
type HelpSection = "basis" | "formula" | "limit"

const H = ({ children }: { children: React.ReactNode }) =>
  <p className="font-semibold text-gray-900 mb-1.5">{children}</p>

const Box = ({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "amber" | "blue" | "emerald" }) => (
  <div className={`rounded-xl p-4 border ${
    tone === "amber" ? "bg-amber-50 border-amber-200"
      : tone === "blue" ? "bg-blue-50 border-blue-200"
      : tone === "emerald" ? "bg-emerald-50 border-emerald-200"
      : "bg-gray-50 border-gray-200"
  }`}>{children}</div>
)

/** 컬럼 설명 표 — 헤더명과 뜻을 1:1로 보여준다 */
const ColTable = ({ rows }: { rows: [string, React.ReactNode][] }) => (
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

/** 페이지 제목 옆 도움말 — 파란 ! 아이콘, 화면 전체의 계산 전제를 설명한다 */
function PageHelpModal({ payoutAge }: { payoutAge: number }) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<HelpSection>("basis")

  return (
    <>
      <button
        onClick={() => { setSection("basis"); setOpen(true) }}
        title="개인연금 계산 안내"
        className="inline-flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#3B82F6" strokeWidth="2" fill="white" />
          <circle cx="12" cy="8" r="1.5" fill="#3B82F6" />
          <rect x="11" y="11" width="2" height="6" rx="1" fill="#3B82F6" />
        </svg>
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900">개인연금 계산 안내</h2>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            <div className="flex gap-1 px-6 pt-3 flex-shrink-0 flex-wrap">
              {([
                ["basis", "계산 전제"],
                ["formula", "산출 방법"],
                ["limit", "⚠️ 한계와 주의"],
              ] as const).map(([s, label]) => (
                <button key={s} onClick={() => setSection(s)}
                  className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                    section === s ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"
                  }`}>{label}</button>
              ))}
            </div>

            <div className="overflow-y-auto px-6 py-4 space-y-4 text-sm">
              {section === "basis" && (
                <>
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl px-5 py-4 text-white">
                    <p className="font-bold text-base mb-1">이 화면의 미래 숫자는 전부 &ldquo;예상치&rdquo;입니다</p>
                    <p className="text-sm text-blue-100">
                      확정된 금액이 아니라, 아래 전제가 그대로 유지된다고 가정했을 때의 계산 결과입니다.
                    </p>
                  </div>

                  <Box>
                    <H>조회 시점 값을 그대로 씁니다</H>
                    <table className="w-full text-xs">
                      <tbody className="[&_td]:py-1 [&_td:first-child]:text-gray-500 [&_td:first-child]:w-32">
                        <tr><td>보유수량</td><td className="text-gray-800">연금저축펀드 계좌의 실제 순수량</td></tr>
                        <tr><td>주가</td><td className="text-gray-800">최신 종가 (성장률 0%로 유지 가정)</td></tr>
                        <tr><td>월 분배율</td><td className="text-gray-800">최근 12회 분배율의 평균</td></tr>
                      </tbody>
                    </table>
                    <p className="text-xs text-gray-500 mt-2">
                      매수를 입력하거나 분배금이 새로 등록되면 다음 조회부터 자동 반영됩니다.
                    </p>
                  </Box>

                  <Box tone="amber">
                    <H>주가를 올리지 않는 이유</H>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      커버드콜 ETF는 주가 상승분을 옵션으로 팔아 분배금으로 돌려주는 구조라,
                      장기적으로 주가는 크게 오르지 않고 분배금이 수익의 대부분을 차지합니다.
                      그래서 주가를 현재가로 두는 편이 실제에 가깝고 결과도 보수적으로 나옵니다.
                    </p>
                  </Box>

                  <Box>
                    <H>세 구간으로 나눠 계산합니다</H>
                    <div className="space-y-1.5 text-xs">
                      <p><b className="text-blue-600">적립</b> 지금 ~ 정년 — 월 적립액 + 분배금을 모두 재투자</p>
                      <p><b className="text-emerald-600">거치</b> 정년 ~ {payoutAge}세 — 적립은 멈추고 분배금만 재투자</p>
                      <p><b className="text-amber-600">수령</b> {payoutAge}세 ~ — 수량을 그대로 두고 분배금만 수령</p>
                    </div>
                  </Box>
                </>
              )}

              {section === "formula" && (
                <>
                  <Box>
                    <H>매월 이렇게 굴러갑니다</H>
                    <pre className="text-xs bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto text-gray-700">{`분배금 = 보유수량 × (주가 × 월 분배율)
매수액 = (적립기간이면 월 적립액) + 분배금
보유수량 += 매수액 ÷ 주가`}</pre>
                    <p className="text-xs text-gray-500 mt-2">
                      분배금으로 다시 사들이므로 수량이 매달 늘고, 늘어난 수량이 다음 달 분배금을 더 키웁니다(복리).
                    </p>
                  </Box>

                  <Box tone="blue">
                    <H>수령액</H>
                    <p className="text-xs text-gray-700">
                      <b>월 수령액 = {payoutAge}세 시점 보유수량 × 주가 × 월 분배율</b>
                    </p>
                    <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                      원금(수량)을 헐지 않고 분배금만 받는 구조라 수령액이 줄지 않습니다.
                      대신 분배율이 떨어지면 수령액도 같이 떨어집니다.
                    </p>
                  </Box>

                  <Box>
                    <H>누적 수령 분배금은 예상이 아닙니다</H>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      실제 지급된 분배금 이력에 각 지급기준일의 <b>해당 월 13일까지 누적 보유수량</b>을
                      곱한 값입니다. 주식 투자 화면의 배당 팝업과 같은 기준입니다.
                    </p>
                  </Box>
                </>
              )}

              {section === "limit" && (
                <>
                  <Box tone="amber">
                    <H>⚠️ 이 숫자가 그대로 실현되지 않는 이유</H>
                    <ul className="text-xs text-gray-700 space-y-2 list-disc pl-4 leading-relaxed">
                      <li><b>분배율은 매달 다릅니다.</b> 최근에도 월 1.36%~1.53% 사이를 오갔습니다.
                        평균으로 10년 이상을 곱하면 오차가 누적됩니다.</li>
                      <li><b>주가가 떨어지면</b> 평가액이 줄고, 같은 분배율이어도 주당 분배금이 함께 줄어듭니다.</li>
                      <li><b>운용사가 분배 정책을 바꾸거나</b> 상품이 청산될 수 있습니다.</li>
                      <li><b>세금·수수료를 반영하지 않았습니다.</b> 연금저축 계좌 안에서는 과세가 이연되지만
                        실제 수령 시에는 연금소득세가 붙습니다.</li>
                      <li><b>물가를 반영하지 않았습니다.</b> {payoutAge}세의 500만원은 지금의 500만원과 가치가 다릅니다.</li>
                    </ul>
                  </Box>

                  <Box tone="blue">
                    <H>표별 자세한 설명은 따로 있습니다</H>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      <b>퇴직 시점별 비교</b>와 <b>연도별 추이</b>는 각 표 제목 옆의
                      <span className="mx-1 inline-flex align-middle">
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="#3B82F6" strokeWidth="2" fill="white" />
                          <circle cx="12" cy="8" r="1.5" fill="#3B82F6" />
                          <rect x="11" y="11" width="2" height="6" rx="1" fill="#3B82F6" />
                        </svg>
                      </span>
                      아이콘을 누르면 컬럼 하나하나의 뜻과 읽는 요령을 볼 수 있습니다.
                    </p>
                  </Box>
                </>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-200 flex justify-end flex-shrink-0">
              <button onClick={() => setOpen(false)}
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

// ─────────────────────────────────────────────
// 표별 전용 도움말
// ─────────────────────────────────────────────
type HelpTab = { key: string; label: string; body: React.ReactNode }

/** 표 제목 옆 "읽는 법" 버튼 + 전용 모달 껍데기 */
function TableHelpModal({ title, lead, tabs }: {
  title: string
  lead: React.ReactNode
  tabs: HelpTab[]
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState(tabs[0].key)
  const current = tabs.find(t => t.key === tab) ?? tabs[0]

  return (
    <>
      <button
        onClick={() => { setTab(tabs[0].key); setOpen(true) }}
        title={`${title} 읽는 법`}
        className="inline-flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
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
                <p className="text-xs text-gray-500 mt-0.5">{lead}</p>
              </div>
              <button onClick={() => setOpen(false)}
                className="text-gray-500 hover:text-gray-700 text-xl leading-none ml-4">×</button>
            </div>

            <div className="flex gap-1 px-6 pt-3 flex-shrink-0 flex-wrap">
              {tabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                    tab === t.key ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"
                  }`}>{t.label}</button>
              ))}
            </div>

            <div className="overflow-y-auto px-6 py-4 space-y-4 text-sm">{current.body}</div>

            <div className="px-6 py-3 border-t border-gray-200 flex justify-end flex-shrink-0">
              <button onClick={() => setOpen(false)}
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

/** 퇴직 시점별 비교 전용 도움말 */
function RetireCompareHelp({ payoutAge, retireAge, monthlyAmount }: {
  payoutAge: number
  retireAge: number
  monthlyAmount: number
}) {
  return (
    <TableHelpModal
      title="퇴직 시점별 비교"
      lead={`언제 적립을 멈추면 ${payoutAge}세 연금이 얼마나 달라지는가`}
      tabs={[
        {
          key: "what", label: "이 표가 뭔가요",
          body: (
            <>
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl px-5 py-4 text-white">
                <p className="font-bold text-base mb-1">&ldquo;몇 살까지 넣느냐&rdquo; 하나만 바꿔본 표입니다</p>
                <p className="text-sm text-blue-100">
                  퇴직 나이를 한 살씩 바꿔가며 같은 시뮬레이션을 다시 돌린 결과입니다.
                  주가·분배율·월 적립액 같은 나머지 전제는 모든 행이 똑같습니다.
                </p>
              </div>

              <Box>
                <H>각 행이 만들어지는 방식</H>
                <ol className="text-xs text-gray-700 space-y-1.5 list-decimal pl-4 leading-relaxed">
                  <li>그 나이가 되는 달까지 매달 <b>{fmt(monthlyAmount)}원 + 분배금</b>을 재투자합니다.</li>
                  <li>그 뒤 {payoutAge}세까지는 적립을 멈추고 <b>분배금만</b> 재투자합니다.</li>
                  <li>{payoutAge}세 시점의 보유수량으로 월 수령액을 계산합니다.</li>
                </ol>
              </Box>

              <Box>
                <H>행의 범위</H>
                <p className="text-xs text-gray-700 leading-relaxed">
                  현재 나이의 다음 해부터 정년({retireAge}세)까지 최대 7개 행을 만듭니다.
                  파란색 <b className="text-blue-700">기준</b> 행이 프로필에 등록된 정년이고,
                  나머지 행은 그보다 일찍 그만두는 경우입니다. 이미 지나간 나이는 표시하지 않습니다.
                </p>
              </Box>
            </>
          ),
        },
        {
          key: "cols", label: "컬럼 설명",
          body: (
            <Box>
              <ColTable rows={[
                ["퇴직 나이", <>적립을 멈추는 나이. <b>기준</b> 배지가 붙은 행이 프로필 정년({retireAge}세)입니다.</>],
                ["퇴직 시점", <>그 나이에 도달하는 달. 정년 행만 정년 규정(생일/말일/연말)을 반영한 실제 시점을 씁니다.</>],
                ["적립 개월", <>지금부터 그 시점까지 월 적립액을 넣는 개월 수. 한 해 차이는 12개월입니다.</>],
                [`${payoutAge}세 보유수량`, <>적립분과 분배금 재투자분이 모두 쌓인 주식 수. 이 표의 <b>실질적인 결과값</b>입니다.</>],
                [`${payoutAge}세 평가액`, <>보유수량 × 현재 주가. 주가를 고정으로 두므로 보유수량에 비례합니다.</>],
                ["월 수령액", <>보유수량 × 주가 × 월 분배율. 원금을 헐지 않고 분배금만 받는 금액입니다.</>],
                ["기준 대비", <>정년까지 다녔을 때와의 월 수령액 차이.
                  <span className="text-blue-600 font-medium"> 파란색이 적음</span>,
                  <span className="text-red-600 font-medium"> 빨간색이 많음</span>을 뜻합니다.</>],
              ]} />
            </Box>
          ),
        },
        {
          key: "read", label: "읽는 법",
          body: (
            <>
              <Box tone="blue">
                <H>&ldquo;1년 더 다니면 월 얼마&rdquo;로 읽으세요</H>
                <p className="text-xs text-gray-700 leading-relaxed">
                  절대 금액은 전제가 흔들리면 같이 흔들리지만, 인접한 두 행의 <b>차이</b>는
                  같은 전제 위에서 계산되므로 훨씬 안정적입니다.
                  &ldquo;{retireAge - 1}세 대신 {retireAge}세까지 다니면 월 수령액이 ○○원 늘어난다&rdquo;
                  — 이 문장을 만드는 것이 이 표의 용도입니다.
                </p>
              </Box>

              <Box tone="emerald">
                <H>감소폭이 생각보다 완만한 이유</H>
                <p className="text-xs text-gray-700 leading-relaxed">
                  적립을 멈춰도 이미 쌓인 수량은 분배금으로 계속 늘어납니다.
                  게다가 <b>늦게 넣은 돈일수록 복리가 굴러갈 기간이 짧아</b> 최종 결과에 대한 기여가 작습니다.
                  마지막 1년치 적립금이 빠져도 전체가 크게 흔들리지 않는 것은 그래서입니다.
                </p>
              </Box>

              <Box>
                <H>조기 퇴직을 저울질할 때</H>
                <p className="text-xs text-gray-700 leading-relaxed">
                  줄어드는 <b>월 수령액</b>과 그 기간에 벌 수 있는 소득·시간을 나란히 놓고 보세요.
                  퇴직 후에도 다른 소득으로 납입을 이어간다면 실제 결과는 그 행보다 큽니다.
                </p>
              </Box>
            </>
          ),
        },
        {
          key: "limit", label: "⚠️ 주의",
          body: (
            <>
              <Box tone="amber">
                <H>⚠️ 이 표에 깔린 가정</H>
                <ul className="text-xs text-gray-700 space-y-2 list-disc pl-4 leading-relaxed">
                  <li><b>퇴직 후에도 계좌는 그대로 둔다</b>고 봅니다. 적립만 멈출 뿐,
                    중도 인출하면 이 표보다 크게 줄어듭니다.</li>
                  <li><b>퇴직 전까지는 매달 빠짐없이 {fmt(monthlyAmount)}원</b>을 넣는다고 봅니다.
                    거른 달이 생기면 그만큼 낮아집니다.</li>
                  <li><b>주가와 분배율은 지금 값이 유지</b>된다고 봅니다.
                    그래서 나이 간 <b>상대 차이</b>는 믿을 만하지만, <b>절대 금액</b>은 참고치입니다.</li>
                  <li><b>세금·수수료가 빠져 있습니다.</b> 실제 수령 시에는 연금소득세가 붙습니다.</li>
                  <li><b>물가를 반영하지 않았습니다.</b> {payoutAge}세의 100만원은 지금의 100만원과 가치가 다릅니다.</li>
                </ul>
              </Box>

              <Box>
                <H>퇴직연금·국민연금은 포함되지 않습니다</H>
                <p className="text-xs text-gray-700 leading-relaxed">
                  이 표는 연금저축펀드 계좌 하나만 다룹니다. 일찍 퇴직하면 퇴직연금 적립과
                  국민연금 가입 기간도 함께 줄어들므로, 실제 노후 소득의 감소폭은 이 표보다 큽니다.
                </p>
              </Box>
            </>
          ),
        },
      ]}
    />
  )
}

/** 연도별 추이 전용 도움말 */
function YearlyTrendHelp({ payoutAge, retireAge }: { payoutAge: number; retireAge: number }) {
  return (
    <TableHelpModal
      title="연도별 추이"
      lead="지금부터 수령 시작까지, 수량이 어떻게 불어나는지"
      tabs={[
        {
          key: "what", label: "이 표가 뭔가요",
          body: (
            <>
              <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl px-5 py-4 text-white">
                <p className="font-bold text-base mb-1">기준 시나리오 하나의 연도별 스냅샷입니다</p>
                <p className="text-sm text-emerald-50">
                  정년({retireAge}세)까지 적립하는 경우만 보여줍니다.
                  매년 <b>12월 말</b> 시점의 상태를 한 줄씩 찍은 것이고, 마지막 줄은 수령 시작 달입니다.
                </p>
              </div>

              <Box>
                <H>세 구간으로 색이 나뉩니다</H>
                <div className="space-y-2 text-xs">
                  <p><b className="text-blue-600">적립</b> — 지금 ~ 정년.
                    <span className="text-gray-600"> 월 적립액과 분배금을 모두 재투자합니다. 수량이 가장 빠르게 늘어나는 구간.</span></p>
                  <p><b className="text-emerald-600">거치</b> — 정년 ~ {payoutAge}세.
                    <span className="text-gray-600"> 새로 넣는 돈은 없고 분배금만 재투자합니다. 그래도 수량은 계속 늘어납니다.</span></p>
                  <p><b className="text-amber-600">수령</b> — {payoutAge}세 이후.
                    <span className="text-gray-600"> 재투자를 멈추고 분배금을 받아 씁니다. 배경이 노란색인 행입니다.</span></p>
                </div>
              </Box>
            </>
          ),
        },
        {
          key: "cols", label: "컬럼 설명",
          body: (
            <Box>
              <ColTable rows={[
                ["시점", <>스냅샷을 찍은 연·월. 매년 <b>12월</b>이며, 마지막 행만 수령이 시작되는 달입니다.</>],
                ["나이", <>그 시점의 만 나이. 생년월일 기준이라 12월 시점 나이입니다.</>],
                ["구간", <><b className="text-blue-600">적립</b> / <b className="text-emerald-600">거치</b> / <b className="text-amber-600">수령</b> 중 그 시점이 속한 단계.</>],
                ["보유수량", <>그 시점까지 쌓인 주식 수. <b>이 표에서 가장 중요한 열</b>입니다 — 나머지 두 열은 여기서 파생됩니다.</>],
                ["평가액", <>보유수량 × 현재 주가. 주가를 고정으로 두므로 보유수량에 정비례합니다.</>],
                ["월 분배금", <>보유수량 × 주가 × 월 분배율. 적립·거치 구간에서는 <b>재투자되는 금액</b>이고,
                  수령 구간에서는 <b>실제로 받는 금액</b>입니다.</>],
              ]} />
            </Box>
          ),
        },
        {
          key: "read", label: "읽는 법",
          body: (
            <>
              <Box tone="blue">
                <H>보유수량 열의 기울기를 보세요</H>
                <p className="text-xs text-gray-700 leading-relaxed">
                  수량이 늘면 다음 달 분배금이 커지고, 커진 분배금이 다시 수량을 늘립니다.
                  적립 구간에서는 적립액까지 더해져 가장 가파르고,
                  거치 구간에 들어가 적립이 끊겨도 <b>기울기가 0이 되지는 않습니다</b> —
                  분배금 재투자만으로도 계속 늘어나기 때문입니다. 이 구간이 복리가 눈에 보이는 대목입니다.
                </p>
              </Box>

              <Box tone="amber">
                <H>수령 구간에서 숫자가 평평해지는 이유</H>
                <p className="text-xs text-gray-700 leading-relaxed">
                  {payoutAge}세부터는 분배금을 재투자하지 않고 받아 쓰므로 수량이 더 늘지 않습니다.
                  원금(수량)을 헐지 않으니 줄지도 않습니다. 그래서 평가액과 월 분배금이 일정하게 유지됩니다.
                </p>
              </Box>

              <Box>
                <H>가까운 몇 년은 점검용, 먼 미래는 방향만</H>
                <p className="text-xs text-gray-700 leading-relaxed">
                  가까운 연도는 실제 매수·분배금 내역과 비교해 계획대로 가고 있는지 점검하는 데 쓰고,
                  먼 연도는 &ldquo;이 속도면 대략 이 정도&rdquo; 정도의 방향으로만 보시면 됩니다.
                </p>
              </Box>
            </>
          ),
        },
        {
          key: "limit", label: "⚠️ 주의",
          body: (
            <>
              <Box tone="amber">
                <H>⚠️ 뒤로 갈수록 믿을 수 없어집니다</H>
                <ul className="text-xs text-gray-700 space-y-2 list-disc pl-4 leading-relaxed">
                  <li><b>가정이 누적됩니다.</b> 10년 뒤 행은 &ldquo;지금 분배율이 120개월 내내 유지된다&rdquo;는
                    가정 위에 서 있습니다. 분배율이 0.1%p만 달라져도 후반부는 크게 벌어집니다.</li>
                  <li><b>주가 변동이 반영되지 않습니다.</b> 평가액 열은 사실상 &ldquo;수량 × 오늘 주가&rdquo;일 뿐입니다.</li>
                  <li><b>12월 스냅샷이라 연중 변동이 보이지 않습니다.</b> 분배율이 월마다 오르내린 흔적은 표에 남지 않습니다.</li>
                  <li><b>물가를 반영하지 않았습니다.</b> 같은 금액이라도 뒤로 갈수록 실질 구매력은 낮습니다.</li>
                  <li><b>세금·수수료가 빠져 있습니다.</b> 계좌 안에서는 과세가 이연되지만 수령 시 연금소득세가 붙습니다.</li>
                </ul>
              </Box>

              <Box>
                <H>기준이 되는 시나리오는 하나뿐입니다</H>
                <p className="text-xs text-gray-700 leading-relaxed">
                  이 표는 정년({retireAge}세)까지 적립하는 경우만 보여줍니다.
                  더 일찍 그만두는 경우가 궁금하면 위의 <b>퇴직 시점별 비교</b>를 보세요.
                </p>
              </Box>
            </>
          ),
        },
      ]}
    />
  )
}

// ─────────────────────────────────────────────
// 계획 설정 모달
// ─────────────────────────────────────────────
function ConfigModal({ config, profile, onClose, onSaved }: {
  config: PerConfig
  profile: ProfileView
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    birth_date: profile.birth_date,
    join_date: profile.join_date,
    retire_age: String(profile.retire_age),
    retire_rule: profile.retire_rule as RetireRule,
    payout_age: String(config.payout_age),
    monthly_amount: config.monthly_amount.toLocaleString("ko-KR"),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  async function save(e: React.SyntheticEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateProfile({
        birth_date: form.birth_date,
        join_date: form.join_date,
        retire_age: Number(form.retire_age) || 60,
        retire_rule: form.retire_rule,
      })
      await updatePerConfig({
        payout_age: Number(form.payout_age) || 63,
        monthly_amount: Number(form.monthly_amount.replace(/,/g, "")) || 0,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했습니다.")
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 sticky top-0">
          <h3 className="text-base font-bold text-gray-800">적립 계획 설정</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <form onSubmit={save}>
          <div className="px-6 py-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">개인 정보</p>
              <p className="text-[11px] text-gray-400 mb-2">퇴직연금·국민연금 화면도 같은 값을 씁니다.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">생년월일 <span className="text-red-400">*</span></label>
                  <input required type="date" className={inputCls} value={form.birth_date} onChange={e => set("birth_date", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">입사일</label>
                  <input type="date" className={inputCls} value={form.join_date} onChange={e => set("join_date", e.target.value)} />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">정년</label>
              <div className="grid grid-cols-[80px_1fr] gap-2">
                <input type="number" min={40} max={80} className={`${inputCls} text-right`}
                  value={form.retire_age} onChange={e => set("retire_age", e.target.value)} />
                <select className={inputCls} value={form.retire_rule}
                  onChange={e => set("retire_rule", e.target.value as RetireRule)}>
                  {(Object.keys(RETIRE_RULE_LABEL) as RetireRule[]).map(r => (
                    <option key={r} value={r}>{RETIRE_RULE_LABEL[r].replace("N", form.retire_age)}</option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">여기까지 적립합니다</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">수령 개시 나이</label>
                <input type="number" min={55} max={90} className={`${inputCls} text-right`}
                  value={form.payout_age} onChange={e => set("payout_age", e.target.value)} />
                <p className="text-[11px] text-gray-400 mt-1">분배금 수령 시작</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">월 적립액</label>
                <input type="text" inputMode="numeric" className={`${inputCls} text-right`}
                  value={form.monthly_amount}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9]/g, "")
                    set("monthly_amount", raw ? Number(raw).toLocaleString("ko-KR") : "")
                  }} />
              </div>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
export default function PersonalPensionPage() {
  const [config, setConfig] = useState<PerConfig | null>(null)
  const [profile, setProfile] = useState<ProfileView | null>(null)
  const [ov, setOv] = useState<PerOverview | null>(null)
  const [pj, setPj] = useState<PerProjection | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [showDist, setShowDist] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [c, pr, o, p] = await Promise.all([
      getPerConfig(), getProfile(), getPerOverview(), getPerProjection(),
    ])
    setConfig(c); setProfile(pr); setOv(o); setPj(p)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-800">개인연금</h1>
              <PageHelpModal payoutAge={config?.payout_age ?? 63} />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              연금저축펀드 적립 현황과 수령 예상액
            </p>
          </div>
          {config && (
            <button onClick={() => setEditing(true)}
              className="text-xs text-blue-600 border border-blue-300 rounded px-3 py-1.5 hover:bg-blue-50">
              적립 계획 설정
            </button>
          )}
        </div>

        {loading || !ov || !pj || !config ? (
          <div className="text-center py-16 text-gray-400 text-sm">불러오는 중...</div>
        ) : (
          <div className="space-y-4">
            {/* ── 현재 현황 ── */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <span className="text-sm font-semibold text-gray-700">현재 현황</span>
                <span className="text-xs text-gray-500">
                  {ov.account_nm} · {ov.stock_name}
                  {ov.price_date && <span className="text-gray-400 ml-1">({ov.price_date} 종가)</span>}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0 divide-gray-200">
                {[
                  { label: "보유수량", value: `${fmt(ov.quantity)}주`, cls: "text-gray-800" },
                  { label: "평가액", value: fmtKRW(ov.value), cls: "text-gray-800" },
                  { label: "매입금액", value: fmtKRW(ov.buy_amount), cls: "text-gray-600" },
                  { label: "평가손익", value: fmtKRW(ov.profit), cls: cc(ov.profit) },
                  { label: "이번 달 예상 분배금", value: fmtKRW(ov.current_monthly_dist), cls: "text-amber-600" },
                ].map(s => (
                  <div key={s.label} className="px-3 py-3 text-center">
                    <p className="text-[11px] text-gray-500 mb-0.5">{s.label}</p>
                    <p className={`text-base font-bold tabular-nums ${s.cls}`}>{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
                  <span>주가 <b className="text-gray-700">{fmt(ov.price)}원</b></span>
                  <span>월 분배율 <b className="text-gray-700">{fmt(ov.monthly_rate * 100, 2)}%</b>
                    <span className="text-gray-400 ml-1">최근 12회 평균 · 연 {fmt(ov.monthly_rate * 1200, 1)}%</span></span>
                  <span>주당 월 분배금 <b className="text-gray-700">{fmt(ov.per_share)}원</b>
                    <span className="text-gray-400 ml-1">예상</span></span>
                </div>

                <button
                  onClick={() => setShowDist(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 bg-white rounded-lg px-2.5 py-1 transition-colors"
                >
                  <span>누적 수령 분배금</span>
                  <b className="tabular-nums">{fmtKRW(ov.received_dist)}</b>
                  <span className="text-blue-400">· {ov.received_count}회</span>
                  <span className="text-blue-500">{showDist ? "내역 닫기 ▲" : "내역 보기 ▼"}</span>
                </button>
              </div>

              {showDist && (
                <div className="border-t border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr className="text-gray-600">
                        <th className="px-4 py-1.5 text-left font-semibold">지급기준일</th>
                        <th className="px-4 py-1.5 text-right font-semibold">보유수량</th>
                        <th className="px-4 py-1.5 text-right font-semibold">주당 분배금</th>
                        <th className="px-4 py-1.5 text-right font-semibold">분배금</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ov.received_rows.map(r => (
                        <tr key={r.ref_date} className="border-b border-gray-100">
                          <td className="px-4 py-1 text-gray-700">{r.ref_date}</td>
                          <td className="px-4 py-1 text-right text-gray-600 tabular-nums">{fmt(r.qty)}주</td>
                          <td className="px-4 py-1 text-right text-gray-600 tabular-nums">{fmt(r.per_share)}원</td>
                          <td className="px-4 py-1 text-right text-amber-600 font-medium tabular-nums">{fmt(r.amount)}원</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="px-4 py-1.5 text-[11px] text-gray-400 bg-gray-50">
                    실제 지급된 분배금 이력 기준입니다 — 주식 투자 화면의 배당 팝업과 같이
                    각 지급기준일의 해당 월 13일까지 누적 보유수량으로 계산합니다.
                  </p>
                </div>
              )}
            </div>

            {/* ── 수령 예상 ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">
                    {config.payout_age}세 수령 예상
                  </span>
                  <span className="text-xs text-gray-500">
                    현재 만 {pj.currentAge}세 · 적립 {pj.base.accumMonths}개월 + 거치 {pj.base.holdMonths}개월
                  </span>
                </div>

                {/* 구간 막대 */}
                <div className="px-4 pt-3">
                  <div className="flex h-6 rounded overflow-hidden border border-gray-200 text-[10px] font-medium">
                    <div className="bg-blue-100 text-blue-700 flex items-center justify-center"
                      style={{ width: `${(pj.base.accumMonths / (pj.base.accumMonths + pj.base.holdMonths)) * 100}%` }}>
                      적립 {pj.base.accumMonths}개월
                    </div>
                    <div className="bg-emerald-100 text-emerald-700 flex items-center justify-center"
                      style={{ width: `${(pj.base.holdMonths / (pj.base.accumMonths + pj.base.holdMonths)) * 100}%` }}>
                      거치 {pj.base.holdMonths}개월
                    </div>
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                    <span>{fmtYm(pj.startYm)}</span>
                    <span>{fmtYm(pj.retireYm)} 퇴직</span>
                    <span>{fmtYm(pj.payoutYm)} 수령</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-200 px-1 py-3">
                  {[
                    { label: "예상 보유수량", value: `${fmt(pj.base.finalQuantity)}주`, cls: "text-gray-800" },
                    { label: "예상 평가액", value: fmtKRW(pj.base.finalValue), cls: "text-gray-800" },
                    { label: "총 납입 원금", value: fmtKRW(pj.base.totalContribution), cls: "text-gray-500" },
                    { label: "재투자로 늘어난 수량", value: `${fmt(pj.base.reinvestedQuantity)}주`, cls: "text-emerald-600" },
                  ].map(s => (
                    <div key={s.label} className="px-2 text-center">
                      <p className="text-[11px] text-gray-500 mb-0.5">{s.label}</p>
                      <p className={`text-sm font-bold tabular-nums ${s.cls}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 월 수령액 강조 */}
              <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg p-5 flex flex-col justify-center">
                <p className="text-amber-100 text-xs mb-1">{config.payout_age}세부터 매달 받는 분배금</p>
                <p className="text-white text-3xl font-bold tabular-nums leading-tight">
                  {fmt(pj.base.monthlyPayout)}<span className="text-lg font-normal ml-1">원</span>
                </p>
                <p className="text-amber-100 text-xs mt-2">
                  연 {fmtKRW(pj.base.yearlyPayout)}
                </p>
                <p className="text-amber-100/80 text-[11px] mt-3 leading-snug">
                  원금(수량)은 그대로 두고 분배금만 받는 구조라 수령액이 유지됩니다.
                </p>
              </div>
            </div>

            {/* ── 퇴직 시점별 비교 ── */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-700">퇴직 시점별 비교</span>
                  <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">예상치</span>
                  <RetireCompareHelp
                    payoutAge={config.payout_age}
                    retireAge={pj.retireAge}
                    monthlyAmount={config.monthly_amount}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  그 나이에 적립을 멈췄다고 가정했을 때의 {config.payout_age}세 예상 금액입니다.
                  절대 금액보다 <b>행 사이의 차이</b>를 보세요.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-xs font-semibold text-gray-700">
                      <th className="px-3 py-2 text-left">퇴직 나이</th>
                      <th className="px-3 py-2 text-left">퇴직 시점</th>
                      <th className="px-3 py-2 text-right">적립 개월</th>
                      <th className="px-3 py-2 text-right">{config.payout_age}세 보유수량</th>
                      <th className="px-3 py-2 text-right">{config.payout_age}세 평가액</th>
                      <th className="px-3 py-2 text-right">월 수령액</th>
                      <th className="px-3 py-2 text-right">기준 대비</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pj.scenarios.map(s => {
                      const isBase = s.retire_age === pj.retireAge
                      return (
                        <tr key={s.retire_age}
                          className={`border-b border-gray-100 ${isBase ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                          <td className={`px-3 py-2 font-medium ${isBase ? "text-blue-700" : "text-gray-800"}`}>
                            {s.retire_age}세{isBase && <span className="ml-1 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">기준</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">{fmtYm(s.retire_ym)}</td>
                          <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{s.accumMonths}</td>
                          <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{fmt(s.finalQuantity)}주</td>
                          <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{fmtKRW(s.finalValue)}</td>
                          <td className="px-3 py-2 text-right font-bold text-amber-600 tabular-nums">{fmt(s.monthlyPayout)}원</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${cc(s.diffFromBase)}`}>
                            {s.diffFromBase === 0 ? "-" : `${s.diffFromBase > 0 ? "+" : ""}${fmt(s.diffFromBase)}원`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── 연도별 추이 ── */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-700">연도별 추이</span>
                  <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">예상치</span>
                  <YearlyTrendHelp payoutAge={config.payout_age} retireAge={pj.retireAge} />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  매년 12월 말 기준 스냅샷입니다. 현재 주가·분배율이 그대로 유지된다는 가정이라
                  <b> 먼 미래일수록 불확실</b>합니다.
                </p>
              </div>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full min-w-max text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr className="text-xs font-semibold text-gray-700">
                      <th className="px-3 py-2 text-left">시점</th>
                      <th className="px-3 py-2 text-left">나이</th>
                      <th className="px-3 py-2 text-left">구간</th>
                      <th className="px-3 py-2 text-right">보유수량</th>
                      <th className="px-3 py-2 text-right">평가액</th>
                      <th className="px-3 py-2 text-right">월 분배금</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pj.base.yearly.map(y => (
                      <tr key={y.ym} className={`border-b border-gray-100 ${y.phase === "수령" ? "bg-amber-50" : "hover:bg-gray-50"}`}>
                        <td className="px-3 py-1.5 text-gray-700">{y.ym}</td>
                        <td className="px-3 py-1.5 text-gray-500">{y.age != null ? `${y.age}세` : "-"}</td>
                        <td className="px-3 py-1.5">
                          <span className={`text-xs font-medium ${
                            y.phase === "적립" ? "text-blue-600" : y.phase === "거치" ? "text-emerald-600" : "text-amber-600"
                          }`}>{y.phase}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-700 tabular-nums">{fmt(y.quantity)}주</td>
                        <td className="px-3 py-1.5 text-right text-gray-700 tabular-nums">{fmtKRW(y.value)}</td>
                        <td className="px-3 py-1.5 text-right text-amber-600 tabular-nums">{fmt(y.distribution)}원</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── 빠른 이동 ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { href: "/sim", title: "연금저축펀드 시뮬레이션", desc: "납입·수익률 조건을 바꿔 비교", icon: "📈" },
                { href: "/magic", title: "복리의 마법", desc: "복리 수익 시뮬레이션", icon: "✨" },
              ].map(item => (
                <Link key={item.href} href={item.href}
                  className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 hover:bg-purple-50 transition-colors">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{item.title}</p>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                </Link>
              ))}
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              주가·보유수량·분배율은 조회 시점의 DB 값을 그대로 씁니다. 주가는 성장률을 두지 않고
              현재가로 유지한다고 봅니다 — 커버드콜은 주가 상승을 포기하고 분배금을 받는 구조입니다.
              분배금은 {config.payout_age}세까지 전액 재투자합니다.
            </p>
          </div>
        )}
      </div>

      {editing && config && profile && (
        <ConfigModal config={config} profile={profile} onClose={() => setEditing(false)} onSaved={load} />
      )}
    </AppLayout>
  )
}
