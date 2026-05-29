# Product Recipes

이 문서는 제품을 먼저 정하고, 필요한 editing feature가 `zod-crud` 어디에
있는지 찾기 위한 지도입니다.

Lab extension은 공식 package가 아닙니다. 제품 요구사항이 반복되는지 확인하기
위한 후보이며, 공개 앱에서 의존하기 전에 승격 여부를 따로 판단해야 합니다.

## 읽는 법

```txt
product feature
|-- core primitive
|-- official extension
|-- lab candidate
`-- app-owned responsibility
```

Core는 JSON 구조 변경, schema validation, Pointer/Patch, `can*`, selection,
clipboard payload, history를 맡습니다. Rendering, focus, keyboard, parser,
auth, remote sync는 앱 책임입니다.

## Kanban

| Feature | Use | App-owned |
| --- | --- | --- |
| Board/card schema | core `createJSONDocument` | schema 설계 |
| Card field edit | core `replace`, `patch`, `canReplace` | field UI |
| Card/list reorder | `@zod-crud/collection` | drag target 계산 |
| Duplicate card | core `duplicate`, paste `rekey` | id 정책 |
| Browser clipboard | `@zod-crud/clipboard-web` | native shortcut UI |
| Card form | `@zod-crud/schema-form` | widget rendering |
| Dirty/save | `@zod-crud/dirty-state`, `@zod-crud/persist-web` | server sync |
| Drag/drop intent | lab `drag-drop` | DOM events, hit testing |
| Comments/review | lab `comments`, lab `proposed-changes` | workflow, authoring |

Kanban에서 가장 먼저 막히는 부분은 stable id에서 JSON Pointer를 찾는 일입니다.
이것은 core primitive라기보다 recipe나 small extension 후보입니다.

## Grid Table

| Feature | Use | App-owned |
| --- | --- | --- |
| Row schema | core `createJSONDocument` | column model |
| Cell edit | core `replace`, `canReplace` | active cell UI |
| Row add/delete/move | core + `@zod-crud/collection` | row handles |
| Batch edit | `@zod-crud/bulk-edit` | selection policy |
| Field descriptor | `@zod-crud/schema-form` | grid column rendering |
| Sort rows | lab `collection-sort` | view state |
| Derived values | lab `computed-fields` | formula language |
| Protected cells | lab `protected-ranges` | role/auth policy |
| TSV/CSV paste | missing candidate | parser, 2D range mapping |

`clipboard-web`는 browser clipboard bridge입니다. Spreadsheet TSV/CSV paste는
별도 adapter 후보입니다.

## Form Builder

| Feature | Use | App-owned |
| --- | --- | --- |
| Form definition JSON | core `createJSONDocument` | form schema |
| Field/section edit | core `replace`, `patch`, `canReplace` | property panel UI |
| Field descriptors | `@zod-crud/schema-form` | rendered inputs, labels, layout |
| Field/option reorder | `@zod-crud/collection` | drag target, keyboard policy |
| Invalid input draft | lab `form-draft` | parser, widget messages |
| Templates/import paste | lab `snippets`, lab `paste-compatible` | snippet catalog, parser |
| Publish review | lab `patch-preview`, lab `proposed-changes` | approval workflow |
| Locked published fields | lab `protected-ranges` | auth/server policy |
| Stable field id lookup | missing recipe candidate | id scope and routing |

`schema-form`은 form renderer가 아닙니다. Zod schema에서 field descriptor를
읽고, 실제 input, label, layout, focus, accessibility는 host가 소유합니다.

## Import Review

| Feature | Use | App-owned |
| --- | --- | --- |
| CSV/JSON parsing | app-owned | parser, column mapping |
| External payload adaptation | lab `paste-compatible` | source format policy |
| Current vs imported diff | lab `document-diff` | identity/move inference |
| Dry-run preview | lab `patch-preview`, core `applyPatch` | visual diff |
| Proposed changes | lab `proposed-changes` | review workflow, storage |
| Reviewer comments | lab `comments` | thread UI, authoring |
| Protected targets | lab `protected-ranges` | role/auth policy |
| Patch audit/replay | `@zod-crud/patch-log` | product activity feed |
| Stable id to Pointer | missing recipe candidate | row/card identity policy |

Import review는 `PatchPlan`이라는 단일 core concept보다 여러 조각으로 남기는
편이 안전합니다. Parser, visual diff, approval workflow는 host 책임이고,
zod-crud 쪽 후보는 dry-run, proposed patch, guard reason, stable target lookup입니다.

## Slide Object Editor

| Feature | Use | App-owned |
| --- | --- | --- |
| Slide JSON document | core `createJSONDocument` | object schema |
| Object create/delete/move | core + `@zod-crud/collection` | command labels |
| Shape property edit | core `replace`, `patch` | geometry semantics |
| Layer order | lab `layer-order` | layer panel UI |
| Group/ungroup | lab `grouping`, lab `wrap-unwrap` | group value factory |
| Drag/drop | lab `drag-drop` | pointer events |
| Lock/protect | lab `protected-ranges` | visibility policy |
| Search/replace | lab `search-replace` | visible text policy |
| Resize/snap/align | missing candidate | hit testing, canvas math |

Canvas rendering, zoom, pan, export, rich text editing, snapping, handles는
`zod-crud`가 아니라 host/editor engine 책임입니다.

## Diagram Whiteboard

| Feature | Use | App-owned |
| --- | --- | --- |
| Shape JSON document | core `createJSONDocument` | object schema |
| Shape CRUD/property edit | core + `@zod-crud/schema-form` | geometry semantics |
| Layer stack | lab `layer-order` | layer panel, rendering |
| Object group/ungroup | lab `grouping` | group factory, bounds policy |
| Frame/container wrap | lab `wrap-unwrap` | frame semantics |
| Connectors/references | lab `references` | ports, routing, geometry |
| Comments | lab `comments` | thread UI, workflow |
| Lock/protect | lab `protected-ranges` | auth/visibility policy |
| Stable id to Pointer | missing recipe candidate | selected object id lookup |

Diagram/whiteboard products need stable object identity more strongly than slide
decks because connectors, layer panels, comments, and selection usually address
objects by id. Geometry, hit testing, snapping, routing, handles, zoom, and pan
stay outside zod-crud.

## Block Docs

| Feature | Use | App-owned |
| --- | --- | --- |
| Block JSON truth | core `createJSONDocument` | block schema |
| Tree movement | `@zod-crud/outline`, `@zod-crud/collection` | keyboard focus |
| Snippet insertion | lab `snippets` | slash palette UI |
| Mention/reference | lab `references` | entity source, autocomplete |
| Review comments | lab `comments` | thread UI, workflow |
| Proposed changes | lab `proposed-changes`, lab `patch-preview` | diff UI, approval |
| External paste/import | lab `paste-compatible`, lab `document-diff` | HTML/Markdown parser |
| Search/replace | lab `search-replace` | rendered text extraction |
| Rich text body | app-owned | ProseMirror/Markdown/contenteditable |

`proposed-changes`는 slash suggestion이나 mention popup이 아닙니다. JSON Patch
변경 제안을 검토하고 accept/reject하기 위한 headless model입니다.

## Repeated Pressure

여러 제품에서 반복된 후보입니다.

| Pressure | Current state | Direction |
| --- | --- | --- |
| Guard composition | lab마다 `can*` guard를 조합 | shared contract 후보 |
| Patch preview / dry-run | lab `patch-preview` | official 후보 |
| Structural result shape | lab마다 `selectionAfter` 필요 | result contract 후보 |
| Anchored pointer lifecycle | core `trackPointer` + labs | annotation helper 후보 |
| Stable id to Pointer | host-owned 반복 | recipe 또는 extension 후보 |
| TSV/CSV grid paste | missing | grid clipboard lab 후보 |
| Invalid draft | lab `form-draft` | official 후보 |
| Import review flow | labs 조합 | recipe 필요 |

## Misread Guardrails

| Name | Do not read as |
| --- | --- |
| `zod-crud` | admin CRUD UI framework |
| `clipboard-web` | spreadsheet TSV clipboard engine |
| `schema-form` | form renderer |
| `grouping` | Airtable group-by |
| `computed-fields` | full formula engine |
| `protected-ranges` | 2D spreadsheet range UI |
| `drag-drop` | DOM drag/drop implementation |
| `persist-web` | server sync |
| `patch-log` | product activity feed |
| `proposed-changes` | slash or mention suggestion popup |
