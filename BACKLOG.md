# Backlog

진행 중이 아닌, 발견된 작업 항목 모음. SPEC 변경이 따르는 큰 결정은 별도 ADR 또는 SPEC PR 로.

## reference editor

- [ ] **apps/sheet — typed cell spreadsheet (validation 시연 reference editor)**
  - 목적: pre-flight (zod schema_violation) 의 "시끄러운 에러" 보장이 실제로 작동하는지 시각화. outliner 는 OutlineSchema refinement 부재로 위반 트리거 불가 → 별도 editor 필요.
  - schema 후보: cell 별 `number / email / url / date / regex` + `min/max` + cross-field `refine`.
  - 부수 효과: axis 2 generalization 의 R3 (비연속 multi-select, rubber-band) 도 검증.
  - 기각 대안: outliner 에 억지 refinement 추가 — 정체성 오염되어 거부.

## zod-crud library

- [ ] **system clipboard 통합 (R4)** — 4-risk 매트릭스 합의됐으나 미구현. `useClipboard` 를 zod-crud 로 승격, `navigator.clipboard` + JSON serialize, paste 진입 시점에 schema 검증.
- [ ] **silent fail 차단** — `strict=false` + `onError` 미설정 시 `console.error` fallback. SPEC §0.1 (5) "시끄러운 에러" 가 사용자 wiring 에 의존하는 약점 보강.
- [ ] **cut 의 atomicity 누수 (G8 위반)** — `commands.cut` 이 `clipboard.copy(...)` + `ops.patch(remove)` 두 호출. 사이가 atomic 아님. 현재 outliner-local 이라 무사하지만 system clipboard 가면 진짜 문제.

## SPEC drift

- [ ] **outliner SPEC §2.5 갱신** — "click 텍스트 → edit" 가 실제로는 "click → select" 로 바뀜. SPEC outranks code 원칙에 따라 SPEC 갱신.
- [ ] **zod-crud SPEC history 갱신** — useJsonDocument facade 가 history 를 owner. SPEC §5.1 의 useJson.history 기술 갱신.
- [ ] **SPEC §7 G8 의 시간 coalescing 의미 추가** — 500ms 창 내 dispatch 가 한 entry 로 묶이는 새 규칙 SPEC 명문화.

## 테스트

- [ ] **인터랙션 테스트의 click→edit 가정 갱신** — click 정책이 select 로 바뀌어 다수 테스트가 옛 가정으로 fail. 다른 에이전트가 진행 중 (외부 작업).
