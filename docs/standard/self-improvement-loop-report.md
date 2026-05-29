# Self-Improvement Loop Report

상태: 10회 루프 완료 기록.

목적은 더 많은 package를 만드는 것이 아니라, 외부 개발자와 LLM이
`zod-crud`를 편집 도구 foundation으로 이해할 수 있는지 반복 검증하는 것이다.

## 루프 구성

| Loop | Focus | Score | 결론 |
| ---: | --- | ---: | --- |
| 1 | 제품 recipe baseline | 7.25/10 | core 경계는 이해되지만 제품별 recipe가 부족했다 |
| 2 | contract pressure gate | 8/10 confidence | `guard composition`, `PatchPlan`은 압력이지만 core 승격은 이르다 |
| 3 | spreadsheet/database editor | 5.5/10 | TSV/CSV paste, stable record id, PatchPlan gap이 크다 |
| 4 | form/survey/admin builder | 6.5/10 | `form-draft`, stable field id, guard/dry-run recipe가 필요하다 |
| 5 | import/review workflow | 6.5/10 | import review recipe와 stable id to Pointer gap이 반복된다 |
| 6 | diagram/whiteboard surface | 6/10 | connector/reference, grouping/wrap, layer-order, geometry boundary가 필요하다 |
| 7 | official package intuition | 8.1/10 | official package는 대체로 읽히지만 `schema-form`, `collection` 오독이 있다 |
| 8 | lab package intuition | 7/10 | lab이 core 압력을 잘 드러내지만 상태 분류가 부족하다 |
| 9 | breaking-risk/API freeze | 7/10 | Result/error code, Selection, schema introspection freeze가 blocker다 |
| 10 | synthesis | 6.9/10 | 1.0 전에는 core 추가보다 freeze 문서와 recipe 보강이 우선이다 |
| 11 | blind product pressure | S1 반복 | strict default, undo/redo Result, stable id, anchor lifecycle, patch preview가 반복됐다 |

평균 점수는 약 6.9/10이다. 이 점수는 실패가 아니라 현재 위치를 의미한다.
Core foundation은 안정적으로 읽히지만, 1.0 전에 freeze해야 할 의미론과
제품별 recipe가 아직 남아 있다.

## 수렴한 강점

```txt
stable strengths
|-- core concept 최소성
|-- public facade 우선 사용
|-- can* -> change -> result 흐름
|-- JSON Pointer / JSON Patch / JSONPath 분리
|-- selection, clipboard, history의 headless 경계
`-- lab으로 product pressure를 먼저 검증하는 전략
```

여러 blind 평가자가 공통으로 core와 app-owned 책임을 비슷하게 분리했다. 이는
`zod-crud`가 headless JSON editing foundation으로 읽힌다는 강한 신호다.

## 반복 Gap

| Gap | 반복된 제품 | 현재 판정 | 1.0 전 액션 |
| --- | --- | --- | --- |
| Result/error code freeze | API freeze | blocker | code taxonomy와 violation shape 문서화 |
| Selection semantics freeze | API freeze, grid, diagram | blocker | public `Selection*` 의미론 문서화 |
| Schema introspection freeze | API freeze, schema-form | blocker | `SchemaKind`, `SchemaDescription`, path mode 문서화 |
| stable id to Pointer | kanban, form, grid, import, diagram | 반영됨: `@zod-crud/id-resolver` | downstream dogfood에서 host-owned id policy 확인 |
| TSV/CSV grid paste | grid, import | lab 후보 | grid clipboard lab 후보로 유지 |
| Patch preview / dry-run | grid, form, import | 반영됨: `@zod-crud/patch-preview` | visual diff/review workflow가 host-owned로 남는지 확인 |
| guard composition | form, import, grid, diagram | lab convention | core 금지, guard vocabulary만 관찰 |
| `selectionAfter` | structural edits, grid, diagram, form | result convention 후보 | lab naming 통일 |
| anchored pointer lifecycle | comments, bookmarks, presence, review | official 후보 | core `trackPointer` 위의 helper 후보로 관찰 |
| text search/replace | docs, review, import, object notes | 반영됨: `@zod-crud/search-replace` | rendered text extraction/ranking은 host-owned 유지 |
| package name misreads | all | doc/catalog 보강 | `Use for` / `Not for` 유지 |

## 1.0 전 Blockers

다음은 새 기능이 아니라 계약 안정화 작업이다.

1. Result/error code와 `violations` shape를 freeze 문서로 열거한다. 반영:
   `docs/standard/result-contract.md`.
2. Public `Selection*` 타입군의 의미론과 patch tracking 복구 규칙을 고정한다.
   반영: `docs/standard/selection-contract.md`.
3. Schema introspection public shape를 고정한다: `SchemaKind`, `SchemaDescription`,
   `SchemaPathMode`, `schema-slot`, `document-result`.
   반영: `docs/standard/schema-introspection-contract.md`.
4. `applyPatchToTrustedState`의 trusted boundary를 더 좁게 문서화한다.

이 작업 없이 core를 더 키우면 1.0 이후 breaking regret가 커진다.

## 1.0 전 Core 금지 목록

반복 압력은 있지만 지금 core에 넣으면 안 되는 것들이다.

- `PatchPlan`
- `GuardedPlan`
- stable id to Pointer resolver in core
- anchor lifecycle state machine
- TSV/CSV parser
- formula runtime
- 2D grid selection
- DOM drag/drop
- geometry, snapping, routing, handles
- remote sync, auth, CRDT/OT

이들은 recipe, lab convention, official extension 후보 순서로만 검증한다.

## 문서와 Catalog 액션

이미 반영된 것:

- Product Recipes 추가.
- `Use for` / `Not for` extension catalog 추가.
- Contract Pressure Register 추가.

이번 루프에서 추가로 반영한 것:

- Form Builder recipe.
- Import Review recipe.
- Diagram Whiteboard recipe.
- `collection` package description을 ordered JSON array command로 명확화.
- `schema-form` package description에 rendered form UI가 아님을 명시.
- `@zod-crud/id-resolver`를 official extension으로 승격.

남은 문서 액션:

- Result/error code freeze 문서.
- Selection semantics freeze 문서.
- Schema introspection freeze 문서.
- Lab status taxonomy: official candidate, recipe-only, experiment.

## Lab 상태 초안

| Status | Labs |
| --- | --- |
| official candidate | `comments`, `form-draft`, `protected-ranges`, `references`, `snippets` |
| conditional official candidate | `document-diff`, `drag-drop`, `proposed-changes` |
| recipe-first | `bookmarks`, `collection-sort`, `computed-fields`, `layer-order`, `paste-compatible` |
| experiment | `convert-node-kind`, `grouping`, `presence-cursors`, `wrap-unwrap` |

이 표는 promotion 결정이 아니다. 다음 루프에서 dogfood evidence가 쌓이면 변경할 수
있는 관찰 상태다.

## Release Readiness

현재 판정은 다음과 같다.

```txt
1.0 readiness
|-- core concept: mostly ready
|-- official extension naming: acceptable with guardrails
|-- lab strategy: healthy, but status taxonomy needed
|-- product coverage: uneven; grid/import/diagram weak
`-- semantic freeze: result, selection, schema docs are now pinned by evaluator
```

따라서 다음 판단은 새 core 추가가 아니라, 이 freeze 문서가 conformance와
제품 압력에서 계속 깨지지 않는지 검증하는 것이다.
