# 개인연금 — 기술 명세

## 재원

연금저축펀드 계좌 하나가 재원이다. IRP·ISA 는 투자 계획이 없어 다루지 않는다.

| 항목 | 값 |
|------|-----|
| 계좌 | `201-04-931585` (NH 연금저축펀드) |
| 종목 | `498400` KODEX 200타겟위클리커버드콜 |
| 적립 | 매달 50만원 수동 매수 |

**별도 잔고 테이블을 만들지 않는다.** 주식 투자 메뉴가 쓰는 `my_stock`·`t_stock_amt`·
`t_etf_dividend` 를 그대로 조회하므로, 매수를 입력하면 개인연금 화면에 바로 반영된다.

---

## DB 스키마

### `my_profile` — 개인 정보 공통 설정 (단일 행)

생년월일·입사일·정년은 개인연금 전용이 아니라 **퇴직연금·국민연금과 공유**하므로
별도 테이블로 분리한다 (v028).

```sql
my_profile (
    id          INT  PRIMARY KEY DEFAULT 1,           -- 항상 1행
    birth_date  DATE NOT NULL,                        -- 생년월일
    join_date   DATE NOT NULL,                        -- 입사일
    retire_age  INT  NOT NULL DEFAULT 60,             -- 정년 나이
    retire_rule TEXT NOT NULL DEFAULT 'month_end',    -- birthday | month_end | year_end
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (id = 1)
);
```

`retire_rule` 이 정년일 계산 방식을 정한다 (`lib/profile.ts` `calcRetireDate`).

| 값 | 정년일 |
|----|--------|
| `birthday` | 만 `retire_age` 세가 되는 생일 당일 |
| `month_end` | 생일이 속한 달의 말일 (기본값) |
| `year_end` | 만 `retire_age` 세가 되는 해의 12월 31일 |

### `my_pension_per_config` — 계획 설정 (단일 행)

시뮬레이션 전제만 저장한다. 보유수량·주가·분배율은 저장하지 않고 매번 조회한다.
생년월일·정년은 `my_profile` 에서 온다 (v028 에서 `birth_ym`·`retire_age` 제거).

```sql
my_pension_per_config (
    id             INT  PRIMARY KEY DEFAULT 1,   -- 항상 1행
    payout_age     INT  NOT NULL DEFAULT 63,     -- 수령 개시 나이
    monthly_amount INT  NOT NULL DEFAULT 500000, -- 월 적립액
    account_no     TEXT NOT NULL,                -- 재원 계좌
    stock_code     TEXT NOT NULL,                -- 재원 종목
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (id = 1)
);
```

---

## 계산 (`lib/pension-per-calc.ts`)

### 조회 시점 값을 그대로 쓴다

주가·수량·분배율을 입력받거나 고정하지 않는다. 화면을 열 때마다 아래를 읽어 계산한다.

| 값 | 출처 |
|----|------|
| 보유수량 `Q0` | `my_stock` 해당 계좌·종목의 순수량 |
| 주가 `P` | `t_stock_amt` 최신 종가 |
| 월 분배율 `r` | `t_etf_dividend` 최근 12회 `dist_rate` 평균 (현재 약 1.45%/월 = 연 17.4%) |
| 주당 월 분배금 | `P × r` |

주가는 성장률을 두지 않는다. 커버드콜은 주가 상승을 포기하고 분배금을 받는 구조라
횡보 가정이 합리적이고, 결과가 보수적으로 나온다. 주가가 바뀌면 다음 조회에 자동 반영된다.

### 월 단위 시뮬레이션

```
구간 1  현재 ~ 퇴직(retire_age)   적립 50만원 + 분배금 재투자
구간 2  퇴직 ~ 수령개시(payout_age) 분배금 재투자만
구간 3  수령개시 ~                  분배금 수령 (수량 고정)
```

```
매월:
  분배금 = Q × (P × r)
  매수액 = (적립기간이면 monthly_amount 더함) + 분배금
  Q     += 매수액 / P
```

수령 개시 시점의 `Q` 로 **월 수령액 = Q × P × r** 을 구한다.

- 원금(수량)은 헐지 않고 분배금만 받는 구조라 수령액이 계속 유지된다
- 세금은 계산하지 않는다. 분배금 자체가 세후 여부를 결정하는 구조다

### 퇴직 시점별 비교

퇴직 나이만 바꿔 같은 계산을 반복한다. 조기 퇴직하면 적립 개월이 줄어
수령액이 얼마나 감소하는지 표로 보여준다.

- 범위: `max(현재나이 + 1, 정년 − 6)` ~ 정년 (최대 7행)
- 정년과 같은 나이의 행만 `retire_rule` 을 반영한 실제 경계(`retireEndYm`)를 쓰고,
  나머지 행은 그 나이가 되는 달(`ymAtAge`)을 쓴다
- `diffFromBase` = 해당 행 월 수령액 − 정년 기준 월 수령액

---

## 누적 수령 분배금

시뮬레이션 값이 아니라 **실제 지급 이력**이다. 주식 투자 화면의 배당 팝업
(`getMonthlyDividendByAccount`)과 동일한 기산 규칙을 쓴다.

```sql
-- 각 지급기준일의 "해당 월 13일까지 누적 순수량" × 주당 분배금
JOIN my_stock ms
  ON ms.stock_code = d.stock_code
 AND ms.account_no = $1
 AND ms.s_date <= TO_CHAR(d.ref_date, 'YYYYMM') || '13'
```

`PerOverview.received_rows` 로 지급기준일별 내역(최신순)을 함께 내려주고,
화면에서 클릭하면 상세 목록 팝업이 열린다.

---

## 서버 액션 (`app/pension/per/actions.ts`)

| 함수 | 반환 | 설명 |
|------|------|------|
| `getPerConfig` | `PerConfig` | 설정 1행 (없으면 기본값으로 생성) |
| `updatePerConfig` | `void` | 수령나이·월적립액 수정 |
| `getPerOverview` | `PerOverview` | 계좌 현황(보유수량·평가액·매입금액·손익) + 시세·분배율 + 누적 수령 분배금 |
| `getPerProjection` | `PerProjection` | 기본 시나리오 + 퇴직 시점별 비교 |

생년월일·정년은 `app/actions/profile.ts` 의 `getProfile` / `updateProfile` 을 쓴다.
모두 `requireAdmin()` 으로 보호한다.

---

## 도움말 컴포넌트 (`app/pension/per/page.tsx`)

미래 숫자가 확정값으로 읽히지 않도록 세 종류의 도움말을 둔다.
표 제목에는 `예상치` 앰버 배지를 함께 붙인다.

| 컴포넌트 | 위치 | 아이콘 | 탭 |
|----------|------|--------|-----|
| `PageHelpModal` | 페이지 제목 옆 | 파란 `!` 원 (24px) | 계산 전제 / 산출 방법 / ⚠️ 한계와 주의 |
| `RetireCompareHelp` | 퇴직 시점별 비교 헤더 | 회색 `?` + `읽는 법` (14px) | 이 표가 뭔가요 / 컬럼 설명 / 읽는 법 / ⚠️ 주의 |
| `YearlyTrendHelp` | 연도별 추이 헤더 | 회색 `?` + `읽는 법` (14px) | 이 표가 뭔가요 / 컬럼 설명 / 읽는 법 / ⚠️ 주의 |

- `PageHelpModal` 은 화면 전체의 계산 전제를 다루고, 표별 상세는 각 전용 도움말로 넘긴다
- 표별 도움말은 공용 껍데기 `TableHelpModal({ title, lead, tabs })` 위에 내용만 얹는다
- 공유 프리미티브: `H`(소제목) · `Box`(gray/amber/blue/emerald 톤) · `ColTable`(컬럼명↔뜻 표)
- 파란 `!` 아이콘 SVG 는 `/sim` 의 `PageHelpModal` 과 동일하다
