# Backlog

진행 중이 아닌, 발견된 작업 항목 모음. 현재 동작 SPEC 은
`packages/zod-crud/SPEC.md`, 목표 API 는 `packages/zod-crud/TARGET_SPEC.md` 를 따른다.

## reference editor

- [ ] **apps/sheet — typed cell spreadsheet (validation 시연 reference editor)**
  - 목적: pre-flight (zod schema_violation) 의 "시끄러운 에러" 보장이 실제로 작동하는지 시각화. outliner 는 OutlineSchema refinement 부재로 위반 트리거 불가 → 별도 editor 필요.
  - schema 후보: cell 별 `number / email / url / date / regex` + `min/max` + cross-field `refine`.
  - 부수 효과: Selection model 의 비연속 multi-select, rubber-band 도 검증.
  - 기각 대안: outliner 에 억지 refinement 추가 — 정체성 오염되어 거부.

## zod-crud library

> Clipboard / cut atomicity / system clipboard 통합 항목은 closure. `boundary` 정합: system clipboard 호출 자체는 본체 밖 (사용자 책임), fragment 직렬화 + RFC 6902 환원만 본체.
> silent fail 정책은 P4 (#31-#34) 의 schema preFlight gate 결과로 흡수.

목표 API 확장 순서:

1. document clipboard (`doc.clipboard`)
2. explainable guard (`doc.check`)
3. read/query facade (`doc.at`, `doc.exists`, `doc.query`, `doc.entries`)
4. history metadata
5. schema introspection facade

## 미해결 (post-v0.12.0)

- **RFC 9535 function extensions** — `length / count / match / search / value` (P6.4 deferred)
- **IETF RFC 9535 conformance suite 통합** — 외부 suite 채택 (P6.5 deferred)
- **cross-field refinement 보호** — preFlight branch-only 의 보호 밖. 별도 ADR 검토

## SPEC drift

- 현재 알려진 drift 없음.

## 테스트

- 현재 알려진 테스트 backlog 없음.
