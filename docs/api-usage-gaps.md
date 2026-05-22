# zod-crud API Usage Gap Ledger

Date: 2026-05-22

Scope: sibling packages under `../` that import `zod-crud`, `zod-crud/react`, or the JSON document primitives. This ledger records gaps only from external-interface usage. Internal source structure tests, private modules, and demo-only decoration are out of scope.

## Current Public Surface

The package root currently exports:

- document facade: `createJSONDocument`, `JSONDocument`, `JSONDocumentHistory`, `JSONDocument*` option/result types
- pure RFC helpers: `applyPatch`, `applyPatchToTrustedState`, `applyOperation`, `JSONPatchOperation`, `JSONResult`
- JSON Pointer helpers: `parsePointer`, `buildPointer`, `appendSegment`, `parentPointer`, `lastSegment`, etc.
- selection types: `JSONPoint`, `SelectionRange`, `SelectionSource`, `SelectionSnap`, `SelectionState`
- React entrypoint: `zod-crud/react` exports `useJSONDocument`

The root does not export `JSONOps`, `Check`, or command/can builder namespaces, and `JSONDocument<T>` does not expose `doc.ops`, `doc.commands`, or `doc.can`.

Important boundary: `packages/zod-crud/src/application/document/ops.ts` defines a low-level ops facade internally, but it is not public package surface.

Public contract is intentionally locked today:

- `packages/zod-crud/tests/create-json-document.test.ts` asserts `"ops" in doc`, `"commands" in doc`, `"check" in doc`, and `"can" in doc` are all false.
- `packages/zod-crud/test/package-smoke.mjs` asserts deep/private subpaths are not package exports.
- `zod-crud/react` exports only `useJSONDocument`; it does not re-export root types such as `JSONResult`.

## Consumer Inventory

| Consumer | Import shape | Observed usage | API status |
| --- | --- | --- | --- |
| `../zod-admin-ui` | `useJSONDocument`, `JSONDocument`, `JSONOps` | Rebuilds `doc.ops` and `doc.commands` in `src/lib/bridge/zodCrudReactCompat.ts`; module-augments `zod-crud` in `src/types/zod-crud-compat.d.ts`; table/form code calls `doc.ops.*`, `doc.commands.*`, `doc.history.transaction`, `doc.clipboard.*`. | Highest signal gap. Active consumer expects a `doc.ops` / `doc.commands` facade that current package does not expose. |
| `../zod-admin-ui/packages/zod-admin-ui` | peer `zod-crud@^0.12.0`, public props typed as `JSONDocument<T>` | Package runtime calls `doc.ops.replace/add/remove`, `doc.commands.move/duplicate/copy/paste/undo/redo` from inside `createAutoForm` and `useNavigator`. | P0 packaging gap. The package declares current zod-crud but actually requires the root app's compat alias. |
| `../editable/apps/composer-demo` | `useJSONDocument` | Calls `jd.ops.patch`, `jd.ops.load`, `jd.commands.undo`, `jd.commands.redo` in examples. | Same legacy facade expectation as zod-admin-ui. |
| `../editable/packages/anyeditable` | `JSONPatchOperation`, `applyPatch` | Defines its own `JSONOps` as `{ apply(patches) }`; wraps user ops with synchronous local snapshot via `applyPatch`. | Not necessarily a core gap, but shows a need for a tiny patch-sink adapter type. |
| `../aria-kernel-apps/legacy/packages/editable-tree` | `useJSONDocument`, `JSONResult` from `zod-crud/react` | Uses `doc.ops.add/remove`, `doc.commands.replace/paste/move/undo/redo`, plus local clipboard state. | Legacy facade expectation. Also imports a type from the React entrypoint that is not exported there. |
| `../aria-kernel-apps/legacy/apps/*`, `legacy/packages/slides` | `createJsonCrud`, `JsonCrud`, `JsonDoc`, `JsonValue` | Uses old graph-shaped CRUD API with `focusFilter`, `childKeys`, `defaultFor`; repo has `tooling/zod-crud-shim.ts` that stubs these names and throws. | Migration gap, not a candidate to restore wholesale unless a separate compat entrypoint is desired. |
| `../nano-edit` | `createJSONDocument`, `JSONDocument`, pointer/selection types | Uses current document facade well: `history`, `selection`, `commit(...,{ selection })`, `lastPatch`, `mergeLast`. ProseMirror/Markdown adapters stay app-side. | Good current-API reference. Minor docs opportunity for editor adapter patterns. |
| `../zod-editor` | `createJSONDocument`, `applyPatch`, `JSONDocument`, selection types | Uses current facade deeply: commits patches with explicit selection, keeps selection-only changes out of history, exposes agent command surface app-side. | Good current-API reference. No immediate core gap. |
| `../bear` | `useJSONDocument` | Uses `doc.patch`, `doc.load`, `doc.history`, `doc.selection`. Note operations mostly replace `/notes` as a whole and do not use `duplicate`, `clipboard`, or `can*`. | Adoption gap: current API works, but domain ops are not yet using granular document actions. |
| `../spredsheet` | `useJSONDocument`, `JSONPatchOperation`, `JSONResult` | Wraps document into local `SheetOps` with `add/remove/replace/patch/undo/redo/canUndo/canRedo`; uses grid-owned selection and browser TSV clipboard. | API adapter gap: consumer wants a small exported ops type or helper, but grid selection/clipboard are domain-specific. |
| `../canvas` | `applyPatch` | Uses zod-crud only as schema-checked patch function. Owns history, selection, clipboard, command/can engine. | Product fit gap or intentional boundary: canvas geometry selection is not JSON selection, but history/can*/command duplication deserves review. |
| `../zod-ppt` | `applyPatch` | Uses zod-crud only for validation. Owns `DeckHistory`, `canUndo/canRedo`, selection state, pointer reads, command palette mutations. | Product fit gap. Could adopt `createJSONDocument` if deck editor wants document history and selection metadata. |
| `../tmp-zod-editor` | `applyPatch` | Uses pure patch application inside a markdown source engine. | No gap; pure helper use is appropriate. |

## Gap Ledger

### G-001: `doc.ops` Facade Drift

Priority: P0

Evidence:

- `../zod-admin-ui/src/lib/bridge/zodCrudReactCompat.ts` creates `ops.add/remove/replace/move/copy/test/patch/load/reset/subscribe/state`.
- `../zod-admin-ui/src/types/zod-crud-compat.d.ts` module-augments `zod-crud` to export `JSONOps<T>` and add `doc.ops`.
- `../spredsheet/src/sheet/useSheetDocument.ts` recreates a narrower `SheetOps`.
- `../editable/apps/composer-demo` and `../aria-kernel-apps/legacy/packages/editable-tree` call `doc.ops.*`.

Current state:

- `JSONOps<T>` exists in `packages/zod-crud/src/application/document/ops.ts`.
- It is not exported from `packages/zod-crud/src/index.ts`.
- `createJSONDocument` builds an internal `ops` object but does not attach it to `JSONDocument<T>`.

Decision needed:

- If `doc.patch`, `doc.load`, `doc.reset`, `doc.value`, and `doc.subscribe` are the final MECE API, publish a migration guide and stop consumers from expecting `doc.ops`.
- If low-level RFC operation methods are intended, export `JSONOps` and expose `doc.ops` deliberately.
- Avoid both names being first-class in the final docs unless one is explicitly marked compatibility-only.

### G-002: `doc.commands` Facade Drift

Priority: P0

Evidence:

- `../zod-admin-ui` rebuilds `commands.move/duplicate/remove/replace/cut/copy/paste/undo/redo`.
- `../editable/apps/composer-demo` expects `jd.commands.undo/redo`.
- `../aria-kernel-apps/legacy/packages/editable-tree` expects `doc.commands.replace/paste/move/undo/redo`.
- The old source-level `commands/buildCommands` builder was removed; command vocabulary now lives in the public facade groups instead of a hidden namespace.

Current state:

- There is no internal `buildCommands` namespace in the current package source.
- `JSONDocument<T>` exposes many command-like methods directly or by subgroup: `duplicate`, `clipboard.copy/cut/paste`, `history.undo/redo`, `selection.*`, `can*`.

Decision needed:

- Prefer one public command vocabulary. Current docs lean toward MECE groups: document mutation, selection state, clipboard payload, history, schema, read, `can*`.
- If `doc.commands` remains useful for keyboard/event bridge code, expose it as a deliberate optional adapter or compatibility entrypoint rather than letting consumers patch it in.

### G-003: Legacy `createJsonCrud` Graph API

Priority: P1 for migration, P3 for core restoration

Evidence:

- `../aria-kernel-apps/tooling/zod-crud-shim.ts` backfills `createJsonCrud`, `JsonCrud`, `JsonDoc`, `JsonValue`, `NodeId`, `OperationResult` with permissive types and runtime throws.
- Legacy kanban/slides code uses `focusFilter`, `childKeys`, and `defaultFor` over graph nodes.

Assessment:

- This is not the same model as the current JSONDocument facade.
- Restoring it in the root API would create duplicate concepts and conflict with the current RFC Pointer/Patch direction.

Decision needed:

- Keep this as migration-only.
- If needed, create a separate `zod-crud/legacy` or local codemod guide; do not mix it into the main public API.

### G-004: Path/Selector Subscription

Priority: P1

Evidence:

- `../zod-admin-ui/src/lib/bridge/useFieldOps.ts` uses `useSyncExternalStore(ops.subscribe, () => getAt(ops.state, pointer))`.
- `../zod-admin-ui/src/lib/bridge/useArrayOps.ts` does the same for arrays.
- `../zod-admin-ui/docs/PRD/slice-20-shared-state.md` records selector subscription as a zod-crud gap.

Current state:

- `doc.subscribe(listener)` broadcasts every applied patch.
- `doc.at(pointer)` reads a pointer once.
- There is no public `subscribePath`, `select`, or `watch` API.

Decision needed:

- Add a small read subscription helper only if repeated consumers need it.
- Candidate shape should preserve external-interface testing: subscribe, mutate by public API, assert only relevant pointer snapshots change.

### G-005: Validation Projection

Priority: P2

Evidence:

- `../zod-admin-ui/src/lib/bridge/useValidation.ts` runs `schema.safeParse(doc.ops.state)` on every doc change and maps Zod issue paths to JSON Pointers.
- `../zod-admin-ui/src/lib/bridge/usePersistence.ts` separately validates hydrated state before `doc.ops.load`.
- `../zod-admin-ui` form flows need invalid/draft state, while strict document mutation rejects invalid values atomically.

Current state:

- `doc.schema` exists, and mutations are preflighted.
- There is no public helper that projects current full-document validation issues to pointer-indexed errors.

Assessment:

- This may be a sidecar rather than core document API.
- It becomes more important if zod-crud positions itself as the store for schema-driven forms/admin surfaces.
- Separate two concerns before implementing: validated document state vs invalid UI draft state. Do not let "validation projection" accidentally weaken atomic document validation.

### G-006: Scoped History / Entity History

Priority: P1

Evidence:

- `../zod-admin-ui/docs/PRD/slice-20-shared-state.md` records root `z.array` global undo mixing edits across entities.
- `../zod-ppt/src/App.tsx` owns `DeckHistory` directly.
- `../canvas/src/canvas/hooks/useCanvasHistory.ts` owns history directly.

Current state:

- `doc.history` is document-wide.
- `doc.history.transaction` can coalesce multiple operations but cannot scope undo to a subtree or entity.

Decision needed:

- Decide whether scoped history is core or sidecar.
- If core, the public contract should be explicit: e.g. history entries tagged by touched pointers, then `undo({ scope })` or a separate scoped controller.

### G-007: Browser/System Clipboard Representations

Priority: P2

Evidence:

- `../zod-admin-ui/src/auto/table/tableClipboard.ts` builds JSON, TSV, plain text, and HTML table payloads.
- `../zod-admin-ui/src/lib/bridge/wireClipboardCommands.ts` keeps `lastPayload` and maps browser/pattern events to zod-crud commands.
- Existing zod-admin-ui issue ledger already records multi-representation copy as a zod-crud issue.

Current state:

- `doc.clipboard` is a headless JSON payload buffer.
- It intentionally does not own `navigator.clipboard`, `DataTransfer`, TSV, HTML, or sanitization.

Decision needed:

- Keep core headless.
- Consider documenting a system clipboard adapter recipe rather than adding browser clipboard to core.

### G-008: Pointer Read Ergonomics

Priority: P3

Evidence:

- `../zod-admin-ui/src/lib/bridge/json-pointer.ts` implements `getAt`.
- `../zod-ppt/src/App.tsx` implements `readPointer`, `parentArrayPath`, `arrayIndex`.
- `../zod-admin-ui/packages/zod-admin-ui/src/runtime/navigator/useNavigator.ts` implements `getAtPointer`, `adjacentArrayItem`, and `rebasePointer`.

Current state:

- zod-crud already has `doc.at(pointer)`, `doc.exists(pointer)`, pointer helpers, and `doc.entries(pointer)`.

Assessment:

- This is partly a docs/adoption gap.
- If consumers keep reimplementing adjacent/rebase logic, add recipes before adding new core APIs.

### G-009: Selection Adapter Boundary

Priority: P2 for docs, P3 for core

Evidence:

- `../nano-edit` and `../zod-editor` successfully bridge ProseMirror/contenteditable selection into zod-crud `SelectionState`.
- `../spredsheet` and `../canvas` keep grid/geometric selection outside zod-crud.

Assessment:

- This is a boundary clarity issue, not automatically a missing core API.
- zod-crud selection is JSON/document selection. Visual grid/canvas selection may be app-owned and only translate to pointers when invoking document mutation/clipboard/history.

### G-010: Public Support Type Export Holes

Priority: P1

Evidence:

- `JSONDocument<T>` exposes `clipboard: ClipboardState<T>`, `schema: SchemaState`, `at(): ReadResult`, `query(): QueryResult`, and `entries(): EntriesResult`.
- `SelectionState` exposes methods whose option/result types include cursor, scope, order, span, and text-edit types.
- `UseJSONDocumentOptions` and `UseSelectionOptions` are part of the public factory/hook signature.
- SPEC shows names such as `ClipboardState`, `SchemaState`, `ReadResult`, `QueryResult`, `EntriesResult`, and `PasteOptions`, but not all of those are root named exports.

Current state:

- Some support types are exported indirectly through property types, but consumers cannot consistently import the named type they see in docs or declarations.
- `JSONDocumentPasteOptions` is exported, but SPEC still says `PasteOptions` in the `canPaste` example.

Decision needed:

- Export every named type that appears in the public `.d.ts` or docs, or remove those names from docs and teach consumers to use indexed access types.
- This is a low-runtime-risk release cleanup because it broadens type exports without changing behavior.

### G-011: Commit Prediction / Mutation Result State

Priority: P2

Evidence:

- `../zod-editor/src/contenteditable-engine.ts` calls pure `applyPatch` to predict `stateAfter`, then calls `doc.commit` with a selection derived from that predicted state.
- `doc.commit` currently returns only `JSONResult`, while `duplicate` and clipboard mutations return `value` and `applied`.

Current state:

- Pure `applyPatch` already returns `{ state, result, applied }`.
- `doc.lastPatch` exposes applied operations after commit.
- `doc.value` exposes state after successful commit.

Assessment:

- The current API is usable, but rich editor adapters may double-apply patches for prediction.
- A callback form such as `selection: (stateAfter) => SelectionSnap | SelectionAction` or a richer commit result could remove that duplication.
- Keep this behind an editor-adapter use case; do not add it just to mirror `applyPatch` unless external tests show the duplication is painful.

### G-012: Rich Text Projection / Editable Slot Adapter

Priority: P2 for adapter exploration, P3 for core

Evidence:

- `../zod-editor` owns `TextRun[]`, multiple editable slots, block plugin operations, and mark splitting.
- `../nano-edit` owns ProseMirror codecs, Markdown source preservation, and selection conversion.
- Both still use `createJSONDocument`, `commit`, `selection`, and `history` successfully.

Assessment:

- This is not a direct JSON document gap. It is an editor adapter boundary.
- zod-crud should stay JSON-tree oriented; rich text projection could live as recipes or an adapter package if repeated.
- A core `selection.textPatch()` should remain string-pointer based unless a more general projection API is proven by external tests.

### G-013: Patch Sink / Fire-and-Forget Ops Type

Priority: P3

Evidence:

- `../editable/packages/anyeditable` defines a local `JSONOps` as `{ apply(patches) }`.
- `../editable/packages/anyeditable/src/composer/syncDocOps.ts` wraps that sink with a synchronous local snapshot before forwarding to the user setter.

Assessment:

- `JSONPatchOperation` and `applyPatch` already fit the data contract.
- A tiny exported `JSONPatchSink` or docs recipe could reduce local naming drift, but this should not be confused with the richer internal `JSONOps<T>`.

## Positive References

Use these as external-interface examples when refining docs or API:

- `../zod-editor/src/contenteditable-engine.ts`: strong use of `createJSONDocument`, `commit(..., { selection })`, selection-only commits, `history`, and `lastPatch`.
- `../nano-edit/src/nano-view.ts`: strong use of `commit`, `selection.restore`, `history.mergeLast`, and ProseMirror selection bridging.
- `../bear/src/hooks/useNotesDoc.ts`: simple React `useJSONDocument` adoption.
- `../spredsheet/src/sheet/useSheetDocument.ts`: narrow app-specific ops adapter around current document facade.

## Immediate Recommendations

1. Decide `doc.ops` / `doc.commands` before release.
   Current active consumers are not aligned with the documented facade. Either expose a deliberate compatibility layer or update consumers away from those names.

2. Do not restore `createJsonCrud` into the main API.
   Treat it as legacy migration because it reintroduces graph/node vocabulary that conflicts with the current RFC Pointer/Patch model.

3. Add selector subscription only after a public-interface test.
   The strongest real need is zod-admin-ui field/array subscriptions. Test it through `useJSONDocument` or `createJSONDocument`, not source internals.

4. Keep browser clipboard adapters outside core for now.
   Document the bridge from `DataTransfer` to `doc.clipboard.write/copy/pastePayload`.

5. Use `zod-editor` and `nano-edit` as current-API dogfood examples.
   They show the newer `commit + selection + history` model working without `doc.ops` or `doc.commands`.

6. Export public support types before adding new behavior.
   This is the cheapest way to reduce consumer-side aliases and module augmentation.
