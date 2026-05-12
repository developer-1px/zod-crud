# Backlog

진행 중이 아닌, 발견된 작업 항목 모음. SPEC 변경이 따르는 큰 결정은 별도 ADR 또는 SPEC PR 로.

## reference editor

- [ ] **apps/sheet — typed cell spreadsheet (validation 시연 reference editor)**
  - 목적: pre-flight (zod schema_violation) 의 "시끄러운 에러" 보장이 실제로 작동하는지 시각화. outliner 는 OutlineSchema refinement 부재로 위반 트리거 불가 → 별도 editor 필요.
  - schema 후보: cell 별 `number / email / url / date / regex` + `min/max` + cross-field `refine`.
  - 부수 효과: Selection model 의 비연속 multi-select, rubber-band 도 검증.
  - 기각 대안: outliner 에 억지 refinement 추가 — 정체성 오염되어 거부.

## zod-crud library

> Clipboard / cut atomicity / system clipboard 통합 항목은 Epic #15 의 P5 (#35-#38) 에서 closure. `boundary` 정합 (ADR-0002): system clipboard 호출 자체는 본체 밖 (사용자 책임), fragment 직렬화 + RFC 6902 환원만 본체.
> silent fail 정책은 P4 (#31-#34) 의 schema preFlight gate 결과로 흡수.

## 미해결 (post-v0.7.0)

- **RFC 9535 function extensions** — `length / count / match / search / value` (P6.4 deferred)
- **IETF RFC 9535 conformance suite 통합** — 외부 suite 채택 (P6.5 deferred)
- **10 verbs facade 메서드 통합** — useJsonDocument 에 `doc.cut() / doc.find()` 등 직접 메서드 노출 (현재는 `verbs/*` pure 함수로만)
- **cross-field refinement 보호** — preFlight branch-only 의 보호 밖. 별도 ADR 검토

## SPEC drift

- [ ] **outliner SPEC §2.5 갱신** — "click 텍스트 → edit" 가 실제로는 "click → select" 로 바뀜. 코드 동작 기준으로 SPEC 갱신.
- [ ] **SPEC §7 G8 의 시간 coalescing 의미 추가** — 500ms 창 내 dispatch 가 한 entry 로 묶이는 새 규칙 SPEC 명문화.

## 테스트

- [ ] **인터랙션 테스트의 click→edit 가정 갱신** — click 정책이 select 로 바뀌어 다수 테스트가 옛 가정으로 fail. 다른 에이전트가 진행 중 (외부 작업).
