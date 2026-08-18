@AGENTS.md
@docs/main_design.md

# 문서 동기화 규칙

`app/` 아래의 코드를 생성·수정·삭제할 때는 반드시 아래 매핑에 따라 관련 docs 파일을 확인하고 변경사항을 반영한다.

## 경로 매핑

| 수정한 코드 경로 | 확인·수정할 문서 |
|-----------------|-----------------|
| `app/pension/nat/**` | `docs/pension/nat/nat_project.md`, `docs/pension/nat/nat_task.md` |
| `app/pension/ret/**` | `docs/pension/ret/ret_project.md`, `docs/pension/ret/ret_task.md` |
| `app/pension/per/**` | `docs/pension/per/per_project.md`, `docs/pension/per/per_task.md` |
| `app/pension/my/**` | `docs/pension/my/my_project.md`, `docs/pension/my/my_task.md` |
| `app/sim/**` | `docs/sim/sim_project.md`, `docs/sim/sim_task.md` |
| `app/magic/**` | `docs/magic/magic_project.md`, `docs/magic/magic_task.md` |
| `app/invest/etf/**` | `docs/invest/etf/etf_project.md`, `docs/invest/etf/etf_task.md` |
| `app/invest/usa/**` | `docs/invest/usa/usa_project.md`, `docs/invest/usa/usa_task.md` |
| `components/**`, `lib/**`, `auth.ts`, `middleware.ts`, `proxy.ts` | `docs/environment.md` |
| 메뉴 추가·삭제·경로 변경 | `docs/main_project.md` |

## 수정 기준

- **`project.md`**: 화면 구조, 기능 추가/제거, 개선 방향이 바뀐 경우
- **`task.md`**: 계산 로직, DB 스키마, 컴포넌트 인터페이스, API가 바뀐 경우
- **`main_project.md`**: 메뉴 경로·이름·기능 요약이 바뀐 경우
- **`environment.md`**: 기술 스택, 환경 변수, DB 연결, 인증 방식이 바뀐 경우

## 절차

1. 코드 변경 진행 전 위 매핑에서 해당 문서를 찾는다.
2. 해당 문서를 읽고 변경할 내용과 다른 부분을 파악한다.
3. 문서를 수정한다 — 추가된 기능은 추가, 제거된 기능은 삭제, 변경된 로직은 갱신.
4. 사용자에게 어떤 문서를 어떻게 수정 후 변경을 진행 할지 확인한다.
5. 달러 금액을 표현할때는 t_fx_rate 테이블을 활용하여 원화 항목을 함께 조회한다.
 - 단 원화를 먼저 표현하고 달러를 부가적으로 나타나게 한다.

# 테이블 생성 기준

**단순 설정값만 담는 테이블은 만들지 않는다. 환경 변수(`config/.env`)를 쓴다.**

이 앱의 사용자는 한 명이고, 개인 정보·계산 전제 같은 값은 몇 년에 한 번 바뀔까 말까다.
그런 값에 테이블·마이그레이션·CRUD 액션·수정 UI 를 붙이면 관리 대상만 늘고 얻는 게 없다.

## 테이블을 만들면 안 되는 경우

아래 중 하나라도 해당하면 환경 변수로 간다.

- **행이 하나뿐이다** — `id INT PRIMARY KEY DEFAULT 1` + `CHECK (id = 1)` 패턴이 나오면 신호다
- **값이 거의 바뀌지 않는다** — 생년월일, 입사일, 정년, 월 적립액, 기준 계좌·종목번호
- **이력이 필요 없다** — 언제 바뀌었는지, 이전 값이 뭐였는지 볼 일이 없다
- **화면에서 수정할 이유가 없다** — 값을 바꾸려고 UI 를 열 일이 1년에 한 번도 없다

## 테이블이 맞는 경우

- 행이 계속 쌓인다 (거래 내역, 청구 이력, 스냅샷, 수집 데이터)
- 이력·시계열이 의미를 갖는다
- 화면에서 일상적으로 추가·수정·삭제한다

## 환경 변수로 갈 때의 규칙

1. 읽기는 전용 모듈에 모은다 — [lib/settings.ts](lib/settings.ts) 참고.
   기본값과 형식 검증을 그 안에서 처리하고, 서버 전용으로 둔다 (클라이언트 컴포넌트에서 import 금지)
2. `config/.env` 에 주석과 함께 추가하고, **Vercel 환경 변수에도 같은 값을 등록**한다
   (누락되면 에러 없이 기본값으로 조용히 동작한다)
3. `docs/environment.md` 의 환경 변수 표와 배포 등록 목록에 추가한다
4. 화면에 설정 팝업이 필요하면 **읽기 전용**으로 만든다 — 현재 값과 대응하는 환경 변수명을 보여준다
5. 값을 바꾸면 dev 서버 재시작이 필요하다 (`next.config.ts` 가 기동 시 1회만 로드)

> 선례: `my_profile`·`my_pension_per_config` 두 테이블을 만들었다가 철회하고
> `PROFILE_*` / `PENSION_PER_*` 환경 변수로 옮겼다. 처음부터 환경 변수로 갔어야 했다.

# SQL 작성 기준

## AS alias 사용 원칙

alias는 꼭 필요한 경우에만 사용한다. **실제 컬럼명을 숨기는 alias는 작성하지 않는다.**

### alias를 사용해야 하는 경우

1. **JOIN 시 동일 컬럼명 충돌** — 두 테이블에 같은 이름의 컬럼이 있어 구분이 필요할 때
   ```sql
   -- i.id와 c.id가 모두 존재 → alias 필요
   c.id AS info_id
   ```
2. **계산식·파생값** — 연산 결과나 리터럴 값에 이름을 붙여야 할 때
   - 이때도 대응하는 DB 컬럼이 존재하면 그 컬럼명을 alias로 사용한다
   - 완전히 새로운 파생값(두 테이블 합산 등)일 때만 새 이름을 붙인다
   ```sql
   -- 대응 컬럼 있음 → 컬럼명 그대로
   i.use_yn                         -- 직접 조회 (boolean 변환은 TypeScript에서)
   COALESCE(c.amt, 0)::int AS amt   -- c.amt와 대응, amt 유지

   -- 완전한 파생값 → 새 이름 허용
   COALESCE(c.amt, 0)::int AS amount     -- 두 테이블 amt 합산 결과
   COALESCE(p.amt, 0)::int AS prev_amount
   ```

### alias를 사용하면 안 되는 경우

- 단순히 컬럼명을 다른 이름으로 바꾸는 용도 → **실제 컬럼명을 그대로 쓴다**
  ```sql
  -- 잘못된 예
  i.item_nm AS name,
  i.cost_type AS payment_method,
  i.pay_dd AS payment_day

  -- 올바른 예
  i.item_nm,
  i.cost_type,
  i.pay_dd
  ```

## TypeScript 타입 작성 원칙

- SQL이 반환하는 컬럼명과 TypeScript 타입의 필드명을 **동일하게** 작성한다.
- alias 없이 `item_nm`을 조회하면 TypeScript 타입도 `item_nm: string`으로 선언한다.
- alias를 쓴 경우에만 alias명을 TypeScript 필드명으로 사용한다 (`info_id`, `amount`, `is_active` 등).

# 수집기 변경 규칙

`collector/` 아래의 코드, FRED 시리즈, 집계 방식, DB 삭제 작업을 변경하기 전에
반드시 아래 4가지를 사용자에게 먼저 보고하고 확인을 받는다. 확인 없이 구현하지 않는다.

1. **값의 의미** — 현재 시리즈와 새 시리즈의 값이 같은 의미인지 (월 평균 vs EOP vs 발표값)
2. **날짜 라벨** — FRED 월집계(`frequency=m`)는 일별 시리즈도 항상 1일 라벨 반환. 월말 날짜가 필요하면 `_to_month_end()` 별도 적용 필요
3. **공백 가능성** — change-detection 방식은 값 동결 기간(예: 금리 동결)에 레코드 미생성 → 차트 공백 발생
4. **DELETE 범위** — 조건부 삭제(`EXTRACT(DAY FROM stat_date) = 1` 등)가 신규 수집 데이터를 함께 삭제할 수 있음. 삭제 전 새 데이터의 날짜 패턴 확인 필수
