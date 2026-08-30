"use client"

/**
 * 장암2구역 투자 현황 — 읽기 전용 화면.
 *
 * 데이터는 data/jangam2.md 가 원본이다. 등록·수정 UI 를 두지 않는다.
 * 화면 구조와 산식은 docs/invest/jangam2/jangam2_project.md 참고.
 */

import { useEffect, useMemo, useState } from "react"
import AppLayout from "@/components/AppLayout"
import HelpModal, { H, Box, ColTable } from "@/components/HelpModal"
import { fmt, fmtKRW, cc } from "@/lib/fmt"
import { getJangam2, type Jangam2Page } from "./actions"

const UNIT_SIZES = ["23평", "26평", "35평", "39평", "43평"] as const

const CARD  = "bg-white rounded-xl border border-gray-200"
const TH    = "px-4 py-2.5 font-medium whitespace-nowrap"
const TD    = "px-4 py-2.5 whitespace-nowrap"
const EMPTY = <p className="text-xs text-gray-400 py-6 text-center">기록된 자료가 없습니다</p>

/** "2025-10-01" → "2025.10.01" */
function dot(date: string): string {
  return date.replace(/-/g, ".")
}

function CardHead({ title, note, help }: { title: string; note?: string; help?: React.ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-gray-100">
      <div className="flex items-center gap-1.5">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        {help}
      </div>
      {note && <p className="text-xs text-gray-400 mt-0.5">{note}</p>}
    </div>
  )
}

export default function Jangam2Page() {
  const [data, setData]       = useState<Jangam2Page | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(false)

  useEffect(() => {
    let alive = true
    getJangam2()
      .then((d) => { if (alive) setData(d) })
      .catch(() => { if (alive) setError(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const latestAsset = data?.assets[0] ?? null
  const latestPrice = data?.prices[0] ?? null
  const otherSum    = useMemo(
    () => (data?.others ?? []).reduce((s, o) => s + o.amt, 0),
    [data]
  )
  /** 평형별 이자 비용 합계 */
  const interestBySize = useMemo(() => {
    const out: Record<string, number> = {}
    for (const size of UNIT_SIZES) {
      out[size] = (data?.interests ?? []).reduce((s, o) => s + (o.by_size[size] ?? 0), 0)
    }
    return out
  }, [data])

  /** 평형별 추정 분담금 · 필요 자금 */
  const funding = useMemo(() => {
    if (!data || !latestAsset || !latestPrice) return []
    return UNIT_SIZES.map((size) => {
      const price = latestPrice.by_size[size]
      if (price == null) return { size, price: null, share: null, interest: 0, need: null }
      const share    = price - latestAsset.right_amt
      const interest = interestBySize[size] ?? 0
      return {
        size,
        price,
        share,
        interest,
        // 이자는 더해야 할 비용, 주식·기타는 이미 준비된 재원
        need: share + interest - data.stock_eval_amt - otherSum,
      }
    })
  }, [data, latestAsset, latestPrice, otherSum, interestBySize])

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-5">

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">장암2구역 투자 현황</h1>
            <HelpModal
              variant="page"
              title="장암2구역 투자 현황"
              lead="재개발 분담금을 감당할 자금이 준비돼 있는지 확인하는 화면"
              tabs={[
                {
                  key: "calc",
                  label: "필요 자금 산식",
                  body: (
                    <>
                      <H>평형마다 이렇게 계산한다</H>
                      <ColTable rows={[
                        ["조합원 분양 예정가", "가장 최근 일자의 해당 평형 예정가"],
                        ["− 권리가액", "가장 최근 종전자산 평가의 권리가액 (= 평가금액 × 비례율)"],
                        ["= 추정 분담금", "조합원이 추가로 내야 하는 금액"],
                        ["+ 이자 비용", "계약/중도금 이자 · 이주비 대여금 이자 · 기타 이자 — 해당 평형 열의 합계"],
                        ["− 주식 계좌 평가액", "MD 에 적은 계좌의 보유 종목 평가액 합계 (DB 실시간)"],
                        ["− 기타 준비 자금", "예금 등 MD 에 적은 다른 재원 합계"],
                        ["= 필요 자금", "아직 더 마련해야 하는 금액. 0 이하면 이미 충족"],
                      ]} />
                      <Box tone="amber">
                        분양 예정가가 아직 없는 평형(빈 칸)은 <b>-</b> 로 표시하고 계산에서 제외한다.
                      </Box>
                    </>
                  ),
                },
                {
                  key: "data",
                  label: "데이터 관리",
                  body: (
                    <>
                      <H>값은 화면이 아니라 파일에서 고친다</H>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        이 화면은 읽기 전용이다. 모든 값은 저장소의 <b>data/jangam2.md</b> 에 있고,
                        파일을 고쳐 저장한 뒤 브라우저를 새로고침하면 바로 반영된다 (서버 재시작 불필요).
                      </p>
                      <Box tone="blue">
                        <b>종전자산 평가</b> 와 <b>조합원 분양 예정가</b> 는 일자별로 행을 계속 추가한다.
                        표에는 이력이 모두 남고, <b>가장 최근 일자</b> 가 추정 분담금·자금 준비 계산 기준이 된다.
                      </Box>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        작성 규칙은 <b>docs/invest/jangam2/jangam2_task.md</b> 에 있다.
                      </p>
                    </>
                  ),
                },
              ]}
            />
          </div>
          <p className="text-gray-500 text-sm mt-0.5">
            재개발 정비사업 현황과 분담금 대비 자금 준비 상태 · 데이터 원본 <code className="text-xs">data/jangam2.md</code>
          </p>
        </div>

        {loading && <p className="text-sm text-gray-400 py-10 text-center">불러오는 중…</p>}

        {error && (
          <div className={`${CARD} p-6 text-center`}>
            <p className="text-sm text-red-600">데이터를 불러오지 못했습니다.</p>
            <p className="text-xs text-gray-400 mt-1">로그인 상태와 data/jangam2.md 파일을 확인해 주세요.</p>
          </div>
        )}

        {data && (
          <>
            {/* 1행 — 일반 현황(4) / 추진 경과(6) */}
            <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
              <div className={`${CARD} overflow-hidden lg:col-span-4`}>
                <CardHead title="일반 현황" />
                <div className="px-5 py-4">
                  {data.general.length === 0 ? EMPTY : (
                    <dl className="space-y-2.5">
                      {data.general.map((g) => (
                        <div key={g.key} className="flex gap-3 text-sm">
                          <dt className="w-32 shrink-0 text-gray-500">{g.key}</dt>
                          <dd className="flex-1 text-gray-900 font-medium break-keep">{g.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </div>

              <div className={`${CARD} overflow-hidden lg:col-span-6`}>
                <CardHead title="추진 경과" />
                <div className="px-5 py-4">
                  {data.progress.length === 0 ? EMPTY : (
                    // 한 행 32px × 5 = 160px — 6번째부터는 스크롤 (비고가 길어 줄바꿈되면 행이 늘어난다)
                    <ol className="max-h-40 overflow-y-auto pr-1">
                      {data.progress.map((p, i) => (
                        <li key={`${p.date}-${p.title}`} className="min-h-8 flex items-center gap-3 text-sm">
                          <span className="w-5 h-5 shrink-0 rounded-full border border-gray-300 text-[10px] text-gray-500 flex items-center justify-center">
                            {i + 1}
                          </span>
                          {/* 내용 3 : 일자 2 : 비고 5 */}
                          <div className="flex-1 grid grid-cols-10 gap-2 items-center py-1">
                            <span className="col-span-3 text-gray-900 break-keep">{p.title}</span>
                            <span className="col-span-2 text-gray-500 tabular-nums">{dot(p.date)}</span>
                            <span className="col-span-5 text-xs text-gray-500 break-keep leading-relaxed">{p.note}</span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            </div>

            {/* 2행 — 특화 품목(4) / 조합원 제공품(6) */}
            <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
              <div className={`${CARD} overflow-hidden lg:col-span-4`}>
                <CardHead title="특화 품목" />
                <div className="px-5 py-4">
                  {data.features.length === 0 ? EMPTY : (
                    <ul className="space-y-2">
                      {data.features.map((f) => (
                        <li key={f} className="flex gap-2 text-sm text-gray-800">
                          <span className="text-gray-300">–</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className={`${CARD} overflow-hidden lg:col-span-6`}>
                <CardHead title="조합원 제공품" />
                <div className="px-5 py-4">
                  {data.gifts.length === 0 ? EMPTY : (
                    <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-2">
                      {data.gifts.map((g) => (
                        <li key={g} className="flex gap-2 text-sm text-gray-800">
                          <span className="text-gray-300">–</span>
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* 3행 — 종전자산 평가(4) / 조합원 분양 예정가(6) */}
            <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
              <div className={`${CARD} overflow-hidden lg:col-span-4`}>
                <CardHead title="종전자산 평가" />
                {data.assets.length === 0 ? <div className="px-5">{EMPTY}</div> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-700">
                          <th className={`${TH} text-left`}>일자</th>
                          <th className={`${TH} text-right`}>평가 금액</th>
                          <th className={`${TH} text-right`}>비례율</th>
                          <th className={`${TH} text-right`}>권리 가액</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {data.assets.map((a, i) => (
                          <tr key={a.date} className={i === 0 ? "bg-blue-50" : "hover:bg-gray-50"}>
                            <td className={`${TD} text-left text-gray-900`}>
                              {dot(a.date)}
                              {i === 0 && (
                                <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">최신</span>
                              )}
                            </td>
                            <td className={`${TD} text-right tabular-nums text-gray-700`}>{fmt(a.eval_amt)}</td>
                            <td className={`${TD} text-right tabular-nums text-gray-700`}>{fmt(a.ratio, 2)}%</td>
                            <td className={`${TD} text-right tabular-nums font-medium text-gray-900`}>{fmt(a.right_amt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className={`${CARD} overflow-hidden lg:col-span-6`}>
                <CardHead title="조합원 분양 예정가" />
                {data.prices.length === 0 ? <div className="px-5">{EMPTY}</div> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-700">
                          <th className={`${TH} text-left`}>일자</th>
                          {UNIT_SIZES.map((s) => (
                            <th key={s} className={`${TH} text-right`}>{s}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {data.prices.map((p, i) => (
                          <tr key={p.date} className={i === 0 ? "bg-blue-50" : "hover:bg-gray-50"}>
                            <td className={`${TD} text-left text-gray-900`}>
                              {dot(p.date)}
                              {i === 0 && (
                                <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">최신</span>
                              )}
                            </td>
                            {UNIT_SIZES.map((s) => (
                              <td key={s} className={`${TD} text-right tabular-nums ${p.by_size[s] == null ? "text-gray-300" : "text-gray-700"}`}>
                                {fmt(p.by_size[s])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* 4행 — 추정 분담금 */}
            <div className={`${CARD} overflow-hidden`}>
              <CardHead title="추정 분담금" />
              {funding.length === 0 ? <div className="px-5">{EMPTY}</div> : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-5">
                  {funding.map((f) => (
                    <div key={f.size} className="rounded-xl border border-gray-200 p-4">
                      <p className="text-xs text-gray-400 mb-1">{f.size}</p>
                      {f.share == null ? (
                        <p className="text-base font-bold text-gray-300">-</p>
                      ) : (
                        <>
                          <p className="text-base font-bold text-gray-900 tabular-nums">{fmt(f.share)}</p>
                          <p className="text-xs text-gray-400 mt-0.5 tabular-nums">{fmtKRW(f.share)}</p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 5행 — 자금 준비 현황 */}
            <div className={`${CARD} overflow-hidden`}>
              <CardHead
                title="자금 준비 현황"
                help={
                  <HelpModal
                    title="자금 준비 현황 읽는 법"
                    lead="필요 자금 = 추정 분담금 + 이자 비용 − 주식 계좌 − 기타 자금"
                    tabs={[{
                      key: "how",
                      label: "읽는 법",
                      body: (
                        <>
                          <ColTable rows={[
                            ["필요 자금 > 0", "아직 부족하다. 빨강으로 표시된 금액만큼 더 마련해야 한다"],
                            ["필요 자금 ≤ 0", "이미 충족했다. 파랑으로 표시되며 괄호 안이 여유 금액이다"],
                            ["이자 비용", "MD 의 「이자 비용」 표에서 해당 평형 열의 합계. 분담금과 함께 마련해야 하므로 더한다"],
                            ["주식 계좌", "MD 에 적은 계좌의 보유 종목 평가액 합계 (보유수량 × 최신 종가)"],
                            ["기타 자금", "MD 의 「기타 준비 자금」 표 합계"],
                          ]} />
                          <Box tone="amber">
                            평형별로 주식 계좌·기타 자금을 <b>중복해서</b> 차감한다.
                            여러 평형을 동시에 분양받는다는 뜻이 아니라, 평형을 하나 골랐을 때의 부족액을 각각 보여주는 것이다.
                          </Box>
                        </>
                      ),
                    }]}
                  />
                }
              />

              {funding.length === 0 ? <div className="px-5">{EMPTY}</div> : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-700">
                          <th className={`${TH} text-left`}>평형</th>
                          <th className={`${TH} text-right`}>분양 예정가</th>
                          <th className={`${TH} text-right`}>권리 가액</th>
                          <th className={`${TH} text-right`}>추정 분담금</th>
                          <th className={`${TH} text-right`}>이자 비용</th>
                          <th className={`${TH} text-right`}>주식 계좌</th>
                          <th className={`${TH} text-right`}>기타 자금</th>
                          <th className={`${TH} text-right`}>필요 자금</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {funding.map((f) => (
                          <tr key={f.size} className="hover:bg-gray-50">
                            <td className={`${TD} text-left font-medium text-gray-900`}>{f.size}</td>
                            {f.price == null || f.share == null || f.need == null ? (
                              <td className={`${TD} text-center text-gray-300`} colSpan={7}>예정가 미정</td>
                            ) : (
                              <>
                                <td className={`${TD} text-right tabular-nums text-gray-700`}>{fmt(f.price)}</td>
                                <td className={`${TD} text-right tabular-nums text-gray-500`}>−{fmt(latestAsset?.right_amt ?? 0)}</td>
                                <td className={`${TD} text-right tabular-nums font-medium text-gray-900`}>{fmt(f.share)}</td>
                                <td className={`${TD} text-right tabular-nums text-gray-500`}>+{fmt(f.interest)}</td>
                                <td className={`${TD} text-right tabular-nums text-gray-500`}>−{fmt(data.stock_eval_amt)}</td>
                                <td className={`${TD} text-right tabular-nums text-gray-500`}>−{fmt(otherSum)}</td>
                                {/* 부족(양수) 빨강 · 충족(0 이하) 파랑 — cc 는 양수를 빨강으로 칠한다 */}
                                <td className={`${TD} text-right tabular-nums font-bold ${cc(f.need)}`}>
                                  {f.need > 0 ? fmt(f.need) : `충족 (${fmtKRW(-f.need)} 여유)`}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 준비 자금(차감) · 이자 비용(가산) 내역 */}
                  <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/60 grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-4">
                    <div className="lg:col-span-1">
                      <p className="text-xs font-semibold text-gray-700 mb-2">
                        준비 자금 내역 <span className="font-normal text-gray-400">— 필요 자금에서 차감</span>
                      </p>
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-gray-100">
                          <tr>
                            <td className="py-1.5 text-gray-600">
                              주식 계좌
                              {data.account && (
                                <span className="text-gray-400 ml-1.5">
                                  {data.account.account_no}
                                  {data.account.account_nm && ` (${data.account.account_nm})`}
                                </span>
                              )}
                              {data.account && !data.stock_found && (
                                <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                                  보유 종목 없음
                                </span>
                              )}
                              {!data.account && (
                                <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                                  계좌 미지정
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-gray-900">{fmt(data.stock_eval_amt)}</td>
                          </tr>
                          {data.others.map((o) => (
                            <tr key={o.item}>
                              <td className="py-1.5 text-gray-600">
                                {o.item}
                                {o.note && <span className="text-gray-400 ml-1.5">{o.note}</span>}
                              </td>
                              <td className="py-1.5 text-right tabular-nums text-gray-900">{fmt(o.amt)}</td>
                            </tr>
                          ))}
                          <tr className="border-t border-gray-200">
                            <td className="py-1.5 font-semibold text-gray-700">합계</td>
                            <td className="py-1.5 text-right tabular-nums font-bold text-gray-900">
                              {fmt(data.stock_eval_amt + otherSum)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="lg:col-span-2">
                      <p className="text-xs font-semibold text-gray-700 mb-2">
                        이자 비용 내역 <span className="font-normal text-gray-400">— 평형별로 필요 자금에 가산</span>
                      </p>
                      {data.interests.length === 0 ? (
                        <p className="text-xs text-gray-400 py-3">기록된 이자 비용이 없습니다</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-200 text-gray-500">
                                <th className="py-1.5 text-left font-medium whitespace-nowrap">항목</th>
                                {UNIT_SIZES.map((s) => (
                                  <th key={s} className="py-1.5 text-right font-medium whitespace-nowrap">{s}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {data.interests.map((o) => (
                                <tr key={o.item}>
                                  <td className="py-1.5 pr-3 text-gray-600 whitespace-nowrap">
                                    {o.item}
                                    {o.note && <span className="text-gray-400 ml-1.5">{o.note}</span>}
                                  </td>
                                  {UNIT_SIZES.map((s) => (
                                    <td key={s} className={`py-1.5 text-right tabular-nums ${o.by_size[s] == null ? "text-gray-300" : "text-gray-900"}`}>
                                      {fmt(o.by_size[s])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                              <tr className="border-t border-gray-200">
                                <td className="py-1.5 pr-3 font-semibold text-gray-700">합계</td>
                                {UNIT_SIZES.map((s) => (
                                  <td key={s} className="py-1.5 text-right tabular-nums font-bold text-gray-900">
                                    {fmt(interestBySize[s] ?? 0)}
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
