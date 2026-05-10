# Changelog

All notable changes to this project will be documented in this file.

This project follows semver once published to npm. Until then, `0.x` releases
may still refine the public API, but documented behavior changes should be
recorded here.

## 0.7.0 - 2026-05-10

**Charter rewording — ADR-0002 supersedes ADR-0001.**

zod-crud 의 정체성을 "FE 서비스가 매번 다시 만드는 편집 어휘 (10 verbs) 를 JSON 표준 (RFC 6901 / 6902 / 9535 / W3C Selection / RFC 8927+Zod) 과 매핑하여 재사용 가능한 표준 레이어로 정립한 JSON tree 라이브러리" 로 단일 정본화.

### Added (Phase 1~8)

- **Folder hierarchy 3-layer**: `hooks/` (얇은 React 어댑터) → `verbs/` (편집 어휘 composer, pure) → `core/` (RFC 표준 substrate, pure) + `sidecars/` (횡단 관심사).
- **`STANDARDS.md`** — RFC ↔ `core/*` 1:1 매핑 표 + Phase 8 자동 검증 입력.
- **`core/history/stack`** — pure undo/redo stack reducer (P2).
- **`core/schema/preFlight`** — patch 적용 전 schema gate (branch-only). `core/schema/validate` — dev-only post-commit assertion (P4).
- **`core/jsonpath/`** — RFC 9535 자체 구현 (외부 의존 0). tokenizer / parser / evaluate. selectors (name / index / slice / wildcard / descendant) + filter expressions (compare / logical / exists). Function extensions (length/count/match/search/value) 는 v0.7.x 후속.
- **10 verbs** (`select / move / cut / copy / paste / duplicate / undo / redo / find / replace`) — `verbs/*` pure composer 로 1 파일 1 동사.
- **자동 검증**: `tests/standards-coverage.test.ts` (RFC ↔ core 1:1) + `tests/verbs-closure.test.ts` (10 verbs + index export).

### Changed (breaking)

- **Schema mandatory** — `useJsonDocument(schema, initial)` 의 schema 는 required (P4.1). 정체성의 "Zod 로 보호되는" 이 정의의 일부.
- **mutating verbs** (move/cut/paste/duplicate/replace/undo/redo) 가 `core/schema/preFlight` gate 통과를 전제 — schema 위반 patch 는 commit 되지 않음 (history 오염 0).
- **Public surface 축소**: `useJson`, `useSelection` 은 internal-only (useJsonDocument facade 가 흡수). 외부는 `useJsonDocument` 단일 진입점 사용 (P7).
- **어휘 정정**: "Editor abstractions" / "Axis 1·2" 폐기 (ADR-0002).
  - `Axis 2` 라벨 → `Selection 기둥` / `core/selection`
  - `Axis 1` 라벨 → `core/pointer` + `core/patch`

### Removed

- `useJson` public export (internal 유지)
- `useSelection` public export (internal 유지)

### Deferred (post-v0.7)

- RFC 9535 function extensions (`length` / `count` / `match` / `search` / `value`) — P6.4
- IETF RFC 9535 conformance suite 통합 — P6.5
- 10 verbs 의 useJsonDocument facade 메서드 통합 (현재는 `verbs/*` pure 함수로만 노출)
- v1.0 — 검증 누적 후 별도 ADR

### Phase log

- v0.2.0 — P1 lift-and-shift (folder hierarchy)
- v0.2.x — P2 history extraction
- v0.3.0 — P3 verbs/ box + 5 initial verbs (select/move/undo/redo)
- v0.4.0 — P4 Zod gate (preFlight + validate)
- v0.5.0 — P5 Clipboard verbs (4대 기둥 closure)
- v0.6.0 — P6 RFC 9535 + find/replace
- v0.7.0 — P7 hooks 정리 + surface 축소 + P8 자동 검증

## 0.1.0 - 2026-04-XX (legacy)

- Initial `zod-crud` package contract.
- Flat `JsonDoc` serialization and deserialization.
- Schema-guarded CRUD operations over `NodeId`.
- Clipboard operations, batch operations, and undo/redo history.
- Package smoke test for ESM runtime import and TypeScript declarations.
