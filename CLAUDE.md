@AGENTS.md

# 문서 동기화 규칙

`app/` 아래의 코드를 생성·수정·삭제할 때는 반드시 아래 매핑에 따라 관련 docs 파일을 확인하고 변경사항을 반영한다.

## 경로 매핑

| 수정한 코드 경로 | 확인·수정할 문서 |
|-----------------|-----------------|
| `app/pension/nat/**` | `docs/pension/nat/nat_project.md`, `docs/pension/nat/nat_task.md` |
| `app/pension/ret/**` | `docs/pension/ret/ret_project.md`, `docs/pension/ret/ret_task.md` |
| `app/pension/per/**` | `docs/pension/per/per_project.md`, `docs/pension/per/per_task.md` |
| `app/pension/seni/**` | `docs/pension/seni/seni_project.md`, `docs/pension/seni/seni_task.md` |
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

# 수집기 변경 규칙

`collector/` 아래의 코드, FRED 시리즈, 집계 방식, DB 삭제 작업을 변경하기 전에
반드시 아래 4가지를 사용자에게 먼저 보고하고 확인을 받는다. 확인 없이 구현하지 않는다.

1. **값의 의미** — 현재 시리즈와 새 시리즈의 값이 같은 의미인지 (월 평균 vs EOP vs 발표값)
2. **날짜 라벨** — FRED 월집계(`frequency=m`)는 일별 시리즈도 항상 1일 라벨 반환. 월말 날짜가 필요하면 `_to_month_end()` 별도 적용 필요
3. **공백 가능성** — change-detection 방식은 값 동결 기간(예: 금리 동결)에 레코드 미생성 → 차트 공백 발생
4. **DELETE 범위** — 조건부 삭제(`EXTRACT(DAY FROM stat_date) = 1` 등)가 신규 수집 데이터를 함께 삭제할 수 있음. 삭제 전 새 데이터의 날짜 패턴 확인 필수
