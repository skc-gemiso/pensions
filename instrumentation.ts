export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
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
  }
}
