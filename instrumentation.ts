export async function register() {
  // Vercel 서버리스 환경에서는 Python 프로세스 실행 불가 → 수집 스케줄 비활성화
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    const cron = (await import("node-cron")).default
    const { startCollection: startEtf } = await import("./lib/etf-collector")
    const { startCollection: startUsa, startFxCollection } = await import("./lib/usa-collector")

    // ETF: 매일 09:00 KST
    cron.schedule(
      "0 9 * * *",
      () => {
        console.log("[Scheduler] ETF 수집 시작")
        startEtf()
      },
      { timezone: "Asia/Seoul" }
    )

    // USA 전체: 매주 월요일 09:00 KST
    cron.schedule(
      "0 9 * * 1",
      () => {
        console.log("[Scheduler] USA 전체 수집 시작")
        startUsa()
      },
      { timezone: "Asia/Seoul" }
    )

    // FX 환율: 매일 09:00 KST (Frankfurter API, 증분 수집)
    cron.schedule(
      "0 9 * * *",
      () => {
        console.log("[Scheduler] FX 환율 수집 시작")
        startFxCollection()
      },
      { timezone: "Asia/Seoul" }
    )

    console.log("[Scheduler] ETF(매일 09:00) · USA(매주 월 09:00) · FX(매일 09:00) 스케줄 등록 완료")

    // 서버 시작 시 당일 ETF 수집 누락이면 즉시 catch-up
    setTimeout(async () => {
      try {
        const { getPensionPool } = await import("./lib/pension-db")
        const pool = getPensionPool()
        const { rows } = await pool.query(`
          SELECT COUNT(*)::int AS cnt FROM etf_fetch_log
          WHERE (fetched_at AT TIME ZONE 'Asia/Seoul')::date
                = (NOW() AT TIME ZONE 'Asia/Seoul')::date
            AND status = 'success'
        `)
        if (rows[0].cnt === 0) {
          console.log("[Scheduler] 당일 ETF 수집 누락 → catch-up 실행")
          startEtf()
        }
      } catch (e) {
        console.error("[Scheduler] ETF catch-up 확인 실패:", e)
      }
    }, 5000)
  }
}
