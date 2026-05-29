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
