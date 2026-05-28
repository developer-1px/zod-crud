# Sibling Repo Extension 검토

Date: 2026-05-28

범위: `../@interactive-os` 아래 sibling repo 중 편집 제품이거나 편집
인프라 경계를 드러내는 repo.

검토 렌즈:

```txt
extension
|-- 설치할 이유가 있는 편집 기능 하나
|-- 단독으로 쓸 수 있을 만큼 작은 범위
|-- zod-crud core 함수와 조립되어 완결되는 함수 패키지
`-- plugin 등록 시스템이 아님

not extension
|-- 제품별 UI, 렌더링, 파싱, geometry, 원격 프로토콜
|-- core primitive를 짧게 감싼 편의 wrapper
`-- sibling infra package가 이미 책임지는 input/accessibility layer
```

## 책임 경계

```txt
zod-crud core
|-- Zod schema로 검증되는 JSON document
|-- JSON Pointer / JSON Patch operation
|-- commit / patch / load
|-- history undo / redo / mergeLast
|-- model selection snapshot
|-- headless model clipboard payload
`-- can* capability probe

feature extension
|-- form / collection workflow
|-- dirty / autosave / persistence workflow
|-- search / replace / bulk edit workflow
|-- comments / outline / bookmarks / checkpoints
|-- patch preview / patch log / document diff
`-- web clipboard bridge

app or sibling package
|-- keyboard shortcut matching -> @interactive-os/keyboard
|-- APG focus and roving behavior -> aria / aria-kernel
|-- user intent naming -> @interactive-os/intent
|-- contenteditable / IME / DOM selection -> anyeditable / editor adapter
|-- canvas geometry, hit testing, handles, zoom, pan -> product
|-- Markdown, formula, slide export, native file formats -> product or domain package
`-- routing, layout, theme, service worker, remote API -> app
```

## 제품별 맵

| Repo | 제품 신호 | zod-crud core가 맡을 것 | extension 압력 | zod-crud 밖에 둘 것 |
| --- | --- | --- | --- | --- |
| `../bear` | Local-first Markdown notes. note CRUD, duplicate, trash, search, outline, backlinks, import/export, image paste/drop. | Notes document, granular note patch, duplicate, history, selection snapshot, model clipboard. | `dirty-state`, `persist-web`, `autosave`, `text-search`, `document-outline`, `collection-sort`, `clipboard-web`. | Markdown parser/rendering, tag/wikilink/backlink graph, PWA/offline shell, browser file import/export policy. |
| `../spredsheet` | Cell, note, style, validation, tab, formula, conditional formatting, undo를 가진 sheet. | 단일 schema document, patch history, cell metadata patch, tab bundle load/reset. | `collection`, `bulk-edit`, `dirty-state`, `persist-web`, `autosave`, `text-search`, `collection-sort`, `computed-fields`, `patch-preview`. | Grid focus, A1 addressing, TSV/system clipboard, formula engine, validation UI, virtualization. |
| `../zod-admin-ui` | Schema-driven admin surface. generated form, preview, table, filter, toolbar, clipboard, reorder, route generation. | Schema-backed document, field patch, array add/remove/move, history, can* gate, model clipboard. | `schema-form`, `collection`, `clipboard-web`, `dirty-state`, `persist-web`, `bulk-edit`, `field-draft`, `patch-preview`, `document-diff`. | Renderer registry, widget catalog, route generation, access policy, REST/service control plane, admin layout. |
| `../ppt` | Slide retouch editor. text/layout patching, selection, autosave, export manifest, undo/redo. | Deck document, slide/block patch, selection, history, patch metadata. | `collection`, `dirty-state`, `persist-web`, `autosave`, `patch-log`, `clipboard-web`, `annotations`, `text-search`, `presence-cursors`. | Slide renderer, layout handle, text surface DOM, HTML/CSS export, geometry policy. |
| `../editable` | JSON Patch와 연결되는 headless inline-edit/contenteditable lifecycle. | `JSONPatchOperation`, host document patch sink, document facade 기반 undo/redo. | `clipboard-web`은 browser bridge일 때만. `field-draft`는 form draft lifecycle일 때만. | IME, `beforeinput`, DOM Selection, caret mapping, combobox trigger, atomic chip rendering. |
| `../nano-edit` | ProseMirror + zod-crud 기반 Live Markdown editor. | Document schema, selection 포함 commit, typing history merge, undo/redo selection restore. | `dirty-state`, `autosave`, `persist-web`, `text-search`, `document-outline`, `checkpoints`, `clipboard-web`. | ProseMirror plugin, Markdown token, source reveal decoration, rich clipboard serialization. |
| `../canvas` | FigJam류 canvas. shape, text, group, section, comment, presence, import drop, find/replace. | Item document, selection snapshot, JSON Patch history, model clipboard, duplicate, find/replace patch. | `collection`, `clipboard-web`, `dirty-state`, `persist-web`, `patch-log`, `text-search`, `annotations`, `drop-intent`, `presence-cursors`. | Hit testing, geometry transform, pointer preview, zoom/pan, contextual control, transient tool. |

## 반복 신호

| 신호 | 보이는 repo | 판정 |
| --- | --- | --- |
| Search / replace | `bear`, `canvas`, `spredsheet`, `nano-edit`, `ppt`, admin table/form | 강한 feature extension 신호. replace까지 책임진다면 `text-search`보다 `search-replace`가 제품 어휘에 가깝다. |
| Outline | `bear`, `nano-edit`, `ppt`, admin nested content, canvas layer/section | 강한 feature extension 신호. feature 이름은 `outline`이고, `document-outline`은 실제 적용 범위보다 좁다. |
| Comments / annotations | `canvas`, `ppt`, 향후 docs/admin review flow | 강한 lab 신호. body/thread/review까지 책임지면 `comments`, anchor metadata만 책임지면 `annotations`가 맞다. |
| Autosave | `bear`, `ppt`, `canvas`, `nano-edit`, `spredsheet` | 강한 feature extension 신호. `dirty-state`/`persist-web`을 대체하지 않고 조립해야 한다. |
| Web clipboard bridge | `bear`, `canvas`, `ppt`, `zod-admin-ui`, `editable` | official 유지. Browser integration은 core가 아니라 환경 bridge다. |
| Collection editing | `spredsheet` tab/row, admin array/table, slide rail, canvas item/group, notes list | official 유지. 안정적인 JSON editing workflow다. |
| Bulk edit | Admin bulk action, spreadsheet range, search replace, canvas multi-select | official 유지. 단순 wrapper가 아니라 command-grade editing feature다. |
| Form/schema editing | `zod-admin-ui`, settings panel, inspector field, validation dialog | official `schema-form` 유지. DOM widget과 rendering은 밖에 둔다. |
| Draft field/form state | `zod-admin-ui`, inline edit, spreadsheet cell edit, inspector form | lab 유지. leaf helper를 넘어서 draft lifecycle을 맡는다면 `field-draft`보다 `form-draft`가 feature스럽다. |
| Drag/drop insert | `bear` file/image drop, `canvas` URL/CSV drop, `ppt` import, admin media/file field | lab 유지. `drop-intent`는 중간 객체 이름에 가깝고, 범위에 따라 `drop-insert` 또는 `drag-drop`이 제품 어휘에 가깝다. |
| Computed fields / formulas | `spredsheet`, admin derived value | lab 유지. Formula engine 자체는 domain package고, zod-crud extension은 dependency-triggered JSON update까지만 맡는다. |
| Presence cursors | `canvas`, 향후 collaborative editor | lab 유지. Remote transport와 CRDT/OT는 밖에 둔다. |
| Patch preview / diff / log | Admin generation, import/reconcile, PPT export manifest, debugging | focused extension으로 유지. UI가 아니라 change-review workflow다. |

## Extension이 아닌 것

| 후보 | 이유 |
| --- | --- |
| Keyboard shortcuts | `@interactive-os/keyboard` 책임이다. zod-crud는 `can*`와 실행 가능한 document operation만 노출하면 된다. |
| Focus navigation | ARIA/APG focus는 JSON document mutation이 아니다. aria package에 남긴다. |
| Intent naming | `@interactive-os/intent`가 input과 적용 layer 사이의 사용자 event를 이름 붙인다. zod-crud가 흡수하면 layer가 섞인다. |
| Active row/card focus | model selection으로 commit되는 경우가 아니면 view/accessibility local state다. |
| Record index / query watch | `query`, `at`, subscription 위의 convenience projection이다. Package가 아니라 recipe다. |
| Selection model wrapper | core가 이미 model selection을 가진다. UI selection adapter는 product 책임이다. |
| Geometry transform | Canvas/PPT domain policy다. zod-crud는 최종 patch를 받으면 된다. |
| Markdown/parser/formula engine | Domain semantics다. zod-crud는 JSON 결과를 저장하고 patch한다. |
| Native file import/export | Product 또는 format package 책임이다. zod-crud는 결과 payload 검증/적용까지만 맡는다. |
| Service worker/offline app shell | App 책임이다. Persistence extension은 storage primitive까지만 제공한다. |

## 제품 조합 Recipe

아래는 새 package가 아니라 제품 조합 예시다.

```txt
outliner
|-- zod-crud core
|-- @zod-crud/collection
|-- @zod-crud/clipboard-web
|-- @zod-crud/dirty-state
|-- @zod-crud/persist-web
|-- @zod-crud/autosave
|-- @zod-crud/outline
|-- @zod-crud/search-replace
|-- @zod-crud/comments
`-- app: tree keyboard/focus, renderer, shortcuts

spreadsheet
|-- zod-crud core
|-- @zod-crud/collection
|-- @zod-crud/bulk-edit
|-- @zod-crud/dirty-state
|-- @zod-crud/persist-web
|-- @zod-crud/search-replace
|-- @zod-crud/collection-sort
|-- @zod-crud/computed-fields
`-- app/domain: grid, formula parser, A1 refs, TSV clipboard

slide-retouch
|-- zod-crud core
|-- @zod-crud/collection
|-- @zod-crud/clipboard-web
|-- @zod-crud/dirty-state
|-- @zod-crud/autosave
|-- @zod-crud/patch-log
|-- @zod-crud/comments
|-- @zod-crud/search-replace
`-- app: stage, handles, layout, export

schema-admin
|-- zod-crud core
|-- @zod-crud/schema-form
|-- @zod-crud/collection
|-- @zod-crud/clipboard-web
|-- @zod-crud/bulk-edit
|-- @zod-crud/form-draft
|-- @zod-crud/patch-preview
`-- app/package: renderer registry, routes, policy, data source
```

## 이름 후속 검토

현재 lab 이름 중 implementation shape가 남은 것:

| 현재 이름 | promote 시 더 나은 feature 이름 | 이유 |
| --- | --- | --- |
| `text-search` | `search-replace` | 제품에서 반복되는 기능은 text lookup만이 아니라 find/search plus replace다. |
| `document-outline` | `outline` | Notes, slide, canvas layer, JSON tree에도 적용되므로 document보다 넓다. |
| `annotations` | `comments` 또는 유지 | body/thread workflow까지 포함하면 `comments`, anchor metadata만이면 `annotations`가 정확하다. |
| `drop-intent` | `drop-insert` 또는 `drag-drop` | 현재 이름은 사용자가 원하는 기능보다 중간 판정 객체를 드러낸다. |
| `field-draft` | `form-draft` | 제품 요구는 leaf field helper보다 form/editor draft lifecycle에 가깝다. |
| `pointer-bookmarks` | `bookmarks` | Pointer는 구현 세부이고 bookmark가 사용자 기능이다. |
| `computed-fields` | 유지 | Generic derived value에는 맞는 이름이다. Spreadsheet semantic을 포함할 때만 formulas로 간다. |

결론: sibling repo들은 convenience package 제거 결정을 지지한다. 다음
extension은 feature 이름을 쓰고 작게 유지해야 한다. 제품 조합은 broad
package로 승격하지 말고 recipe로 문서화하는 편이 core concept을 덜
늘린다.
