# 생활비 메뉴 구현 진행 상황

이 파일은 세션 도중 토큰 소진 시 재개를 위한 체크리스트입니다.

## 체크리스트

- [x] `docs/life/cost/cost_project.md` 생성
- [x] `docs/life/cost/cost_task.md` 생성
- [x] `docs/main_project.md` — `/life/cost` 메뉴 항목 추가
- [x] `lib/auth-db.ts` — v016 마이그레이션 추가 (my_cost_item, my_cost_info 테이블 + life-cost 메뉴)
- [x] `app/life/cost/actions.ts` 생성
- [x] `app/life/cost/page.tsx` 생성
- [x] `app/life/page.tsx` — `/life/cost` 리다이렉트로 변경
- [ ] git push

## 재개 방법

새 세션에서 이 파일을 읽은 후 미완료 항목부터 진행.
설계 상세는 [PLAN.md](PLAN.md), 기술 명세는 [cost_task.md](cost_task.md) 참조.
