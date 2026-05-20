# zod-crud

All frontend editing is JSON editing. zod-crud is a headless JSON editing
engine that maps the **edit vocabulary every FE service rebuilds from
scratch** (select, move, cut, copy, paste, duplicate, undo, redo, find,
replace) onto JSON standards (**RFC 6901 Pointer · RFC 6902 Patch · RFC 9535
JSONPath · W3C Selection · RFC 8927 + Zod**) so the vocabulary becomes a
**reusable standard layer**.

State, actions, and change records are 100% serializable JSON. The core is
pure RFC substrate. `verbs/*` compose substrate into the 10 edit verbs.
`createJSON` owns low-level headless JSON state. `createJSONDocument` exposes
the headless document facade. `zod-crud/react` exposes matching React facades
plus React-only composition hooks.
`sidecars/` hold cross-cutting concerns (recorder, debug log, http).

The behavior contract lives in [`SPEC.md`](./SPEC.md). It documents current
code behavior; on conflict, SPEC §11 applies: code behavior wins unless it
conflicts with an RFC, in which case the RFC wins. The RFC ↔ `core/*` 1:1
mapping is in [`STANDARDS.md`](./STANDARDS.md).

The future engine target lives in [`TARGET_SPEC.md`](./TARGET_SPEC.md). It
tracks the intended headless JSON editing surface and is not a current API
claim.

## Install

```sh
npm install zod-crud zod
```

`zod` is a peer dependency. `react >=18` is an optional peer dependency
required only for React hooks. The package is ESM-only.

> **단일 zod instance 필수.** monorepo / pnpm 환경에서 `zod-crud` 와 소비자가 서로 다른
> `zod` 인스턴스를 보면 `useJSONDocument` 의 generic 추론이 `unknown` 으로 떨어진다
> (`$ZodFunction / $ZodTypes` 심볼이 두 번 존재). 해결책:
> - pnpm: `public-hoist-pattern[]=zod` 또는 `dedupe-peer-dependents=true`
> - 그래도 해소 안 되면 소비자 `tsconfig.json` 에 paths alias 로 단일 경로 강제:
>   ```json
>   "paths": { "zod": ["./node_modules/zod"], "zod/*": ["./node_modules/zod/*"] }
>   ```

## React — `useJSONDocument`

```tsx
import * as z from "zod";
import { useJSONDocument } from "zod-crud/react";

const Schema = z.object({
  title: z.string(),
  tasks: z.array(z.object({ id: z.string(), done: z.boolean() })),
});

export function App() {
  const doc = useJSONDocument(Schema, { title: "", tasks: [] }, { history: 50 });

  return (
    <>
      <input
        value={doc.value.title}
        onChange={(e) => doc.ops.replace("/title", e.target.value)}
      />
      <button
        onClick={() =>
          doc.ops.add("/tasks/-", { id: crypto.randomUUID(), done: false })
        }
      >
        add task
      </button>
      <button onClick={doc.commands.undo} disabled={!doc.can.undo}>
        undo
      </button>
      {doc.value.tasks.map((t, i) => (
        <div key={t.id}>
          <input
            type="checkbox"
            checked={t.done}
            onChange={(e) =>
              doc.ops.replace(`/tasks/${i}/done` as `/tasks/${number}/done`, e.target.checked)
            }
          />
          <button onClick={() => doc.ops.remove(`/tasks/${i}` as `/tasks/${number}`)}>
            remove
          </button>
        </div>
      ))}
    </>
  );
}
```

`useJSONDocument` returns a single facade with document fields and helpers:

| Surface | Purpose |
| --- | --- |
| `doc.value` | current schema-valid state (`T`) |
| `doc.lastPatch` | value snapshot of the last applied document patch; `[]` after selection-only commits |
| `doc.ops` | low-level `JSONOps` — `state` + `add`/`remove`/`replace`/`move`/`copy`/`test`/`set`/`patch`/`apply`/`load`/`reset`/`subscribe`, plus facade undo/redo controls |
| `doc.commands` | edit commands plus selection/text helpers (`replaceText`, cursor movement, select scope) |
| `doc.can` | mutation, JSONPath find, and selection guard predicates + `undo`/`redo` flags |
| `doc.check` | explainable dry-run guard results for commands, JSONPath find, and selection movement; `can.x(...) === check.x(...).ok` |
| `doc.schema` | serializable path introspection (`at`/`kind`/`accepts`/`describe`) |
| `doc.selection` | W3C-shaped selection coordinates (`JSONPoint`, primary range, selected pointer projection) |
| `doc.clipboard` | headless JSON clipboard buffer (`copy`/`cut`/`paste`/`toItems`) |
| `doc.history` | `canUndo`/`canRedo`/depth flags, `mergeLast(options?)`, `transaction(options?, fn)` |
| `doc.commit` | document-level patch commit with optional final `selection` and history metadata |

The facade also exposes read/query helpers: `doc.at(path)`,
`doc.exists(path)`, `doc.query(jsonpath)`, and `doc.entries(path)`.

Selection and history are first-class — they are not parallel hooks you wire
up yourself. `commands.*` mutate through the history-aware path; `doc.commit`
is the editor-engine path when a patch and final model selection must land in
one undo entry; `ops.*` is the low-level RFC 6902 escape hatch for
fire-and-forget patches.

## Headless — `createJSONDocument`

```ts
import * as z from "zod";
import { createJSONDocument } from "zod-crud";

const Schema = z.object({
  title: z.string(),
  tasks: z.array(z.object({ id: z.string(), done: z.boolean() })),
});

const doc = createJSONDocument(Schema, { title: "", tasks: [] }, { history: 50 });

doc.ops.add("/tasks/-", { id: "a", done: false });
doc.commit(
  [{ op: "replace", path: "/title", value: "final" }],
  { label: "rename", origin: "editor", selection: { type: "collapse", pointer: "/title" } },
);
doc.history.transaction(() => {
  doc.ops.add("/tasks/-", { id: "b", done: true });
  doc.ops.add("/tasks/-", { id: "c", done: false });
});
doc.commands.undo();
```

`createJSONDocument` and `useJSONDocument` intentionally share the same
`value`/`lastPatch`/`ops`/`commands`/`can`/`check`/`schema`/`selection`/`clipboard`/`history`
surface, plus `commit` and read/query helpers. React owns render lifecycle
only; core owns JSON editing.
For lower-level composition, `createCommands(args)`, `createCheck(args)`, and
`createCan(args)` expose the same selection-aware command, dry-run, and boolean
guard facades used by the document facade.
`createJSON(schema, initial, options?)` exposes the same low-level JSON state
owner and `JSONOps<T>` surface that `useJSON` renders in React.

Selection is headless. `JSONPoint` is either a JSON Pointer string or
`{ path, offset?, edge?, affinity? }`, so list/tree item selection and text
carets use the same core model. `doc.selection.selectionRanges` is the source
of truth for caret/range shape; `doc.selection.selectedPointers` is the
item-selection projection for list/tree/grid UIs.
`doc.selection.primaryRange` exposes the active range and `doc.selection.caret`
exposes the collapsed cursor point. `rangeCount`, `selectedCount`, and
`hasSelection` expose selection cardinality, and `isSelected(pointer)` is the
per-item selected predicate for list/tree/grid rendering. `togglePointer(pointer)`
toggles one item in that selected-pointer projection, including removing a
single item from inside an expanded range while preserving sparse selection.
`anchorPointer`, `focusPointer`, `primaryPointer`, and `caretPointer` expose
the Pointer projections needed by scalar Pointer commands; `selectedSource` is
the null/single/multi source projection accepted by `copy` / `cut`.
`doc.selection.moveCursor(direction, options?)` and
`doc.selection.extendCursor(direction, options?)` move or extend selection in
JSON source-order within an optional `scope`; pass `query` to use RFC 9535
JSONPath results, or `points` to use a filtered, folded, virtualized, or
otherwise app-visible `JSONPoint[]` order. `points` takes precedence over
`query`, and both bypass `scope` traversal. `resolveCursor` computes the next
target without mutating. The pure helpers
`moveSelectionCursor`, `extendSelectionCursor`, and `resolveSelectionCursor`
provide the same cursor logic for standalone headless composition.
`doc.commands.moveCursor(direction, options?)` and
`doc.commands.extendCursor(direction, options?)` expose keyboard-style cursor
movement through the document command namespace.
`doc.check.moveCursor` / `doc.can.moveCursor` and `doc.check.extendCursor` /
`doc.can.extendCursor` answer whether the same cursor movement is available
without mutating selection; boundary failures return `cursor_boundary`.
`doc.selection.selectScope(options?)` and `selectSelectionScope(...)` build a
whole selection from the same `scope`, `query`, or visible `points` options,
covering Ctrl+A/select-visible and select-find-results flows without React.
`doc.selection.orderPrimaryRange(options?)`, `doc.selection.orderRanges(options?)`,
`orderSelectionRange(...)`, `orderPrimarySelectionRange(...)`, and
`orderSelectionRanges(...)` convert directional anchor/focus ranges into
document-order `start`/`end` ranges for delete, format, copy, and paste
commands. The plural form sorts all ranges by document order while preserving
their original range index and primary flag. They use JSON source-order by
default, RFC 9535 `query` order when provided, or explicit visible `points`
order for folded/virtualized UIs.
`doc.selection.spansForPointer(pointer, options?)` and
`selectionSpansForPointer(...)` project selection ranges into pointer-local
spans for rendering or offset-based commands. String values resolve offsets
from current state; apps can provide `getLength` for non-string offset domains
such as rich-text block paths.
`doc.selection.textEdits(replacement, options?)` and `selectionTextEdits(...)`
turn the current selection into ordered pointer-local replacement spans without
mutating state. `doc.selection.textPatch(replacement, options?)` and
`replaceSelectionText(...)` build RFC 6902 `replace` patches plus the final
collapsed selection for JSON string leaves; multi-pointer rich-text/block edits
use the edit plan and app-specific patching. `doc.commands.replaceText(...)`
commits that string-leaf patch through document history and final selection.
`doc.commands.selectScope(options?)` exposes the same flow through the document
command namespace.
`doc.check.selectScope` / `doc.can.selectScope` guard that flow; an empty
scope returns `empty_scope`.
`UseSelectionOptions.initial` and `selectRanges` accept `JSONPoint` or
`SelectionRange`, so disjoint multi-range selection and offset/edge carets are
headless from initialization. Facade-level
`commands.copy()` / `commands.cut()`, `doc.clipboard.copy()` /
`doc.clipboard.cut()`, `check.copy()` / `check.cut()`, and `can.copy()` /
`can.cut()` default to the current selection when the source is omitted and
return `empty_selection` when that selection is empty.
Facade-level `commands.move(to)`, `check.move(to)`, and `can.move(to)` default
to the primary selection source when the source is omitted; the target remains
an explicit Pointer.
Facade-level `commands.duplicate()`, `check.duplicate()`, and
`can.duplicate()` default to the primary selection source when the source is
omitted; `commands.duplicate({ newKey })` duplicates a selected object member.
Facade-level `commands.replace(value)`, `check.replace(value)`, and
`can.replace(value)` default to the primary selection target when the path is
omitted. With an explicit JSONPath string, `commands.replace(jsonpath, value)`
commits an atomic multi-match replace; `check.replace(jsonpath, value)` and
`can.replace(jsonpath, value)` dry-run the same batch and report `empty_match`
when the query matches nothing.
Facade-level `commands.replaceText(replacement, options?)`,
`check.replaceText(replacement, options?)`, and
`can.replaceText(replacement, options?)` use the full selection range model for
JSON string-leaf text edits.
Facade-level `commands.paste(payload)`, `doc.clipboard.paste()`,
`check.paste(payload)`, and `can.paste(payload)` default to the primary
selection target when the target is omitted; a mode-only call such as
`commands.paste(payload, "after")` uses that same target.
String caret offsets are clamped to the current string length when state is
available, including after document edits that keep the same Pointer alive.
Selection getters, `doc.selection.snapshot()`, and `doc.selection.toJSON()`
return value snapshots, so callers can store or mutate returned `JSONPoint`
objects without corrupting the live headless selection state.
`JSON.stringify(doc.selection)` emits that same snapshot, and
`doc.selection.restore(snapshot)` restores it.
`doc.selection.context` is optional JSON-serializable selection-local editing
state. Use it for stored marks, active tool state, or other headless context
that belongs to the selection/caret rather than the document JSON. It is cloned
in snapshots, restored through `restore(snapshot)`, preserved by cursor/path
tracking, and can be updated with `setContext`, `clearContext`, or a
`SelectionAction` carrying `context`.
`doc.selection.subscribe(listener)` emits JSON-safe snapshots after manual
selection actions and automatic op tracking.
`doc.commands.select(action)`, `doc.commands.selectScope(options?)`,
`doc.commands.moveCursor(direction, options?)`, and
`doc.commands.extendCursor(direction, options?)` default to the document's
configured selection mode, so headless and React facades preserve the same
multi-select behavior and the full `SelectionSnap`, including `context`.
`doc.commit(patch, { selection, label, origin, mergeKey })` applies an RFC 6902
patch, overrides mutation auto-selection with the provided final `SelectionAction`
or `SelectionSnap`, and records data + final selection in one history entry.
When the final selection carries `context`, that context is recorded with
`selectionAfter` and restored by undo/redo.
When `patch` is empty, `commit` may update selection but does not create a
document patch or undo entry.
`doc.lastPatch` exposes the last applied normalized document patch as a value
snapshot. It updates for commands, ops, load/reset, undo, and redo, and clears
to `[]` after empty patch commits such as selection-only edits.

Clipboard is headless too. `doc.clipboard` stores a JSON fragment and source
metadata. Single-source copy/cut returns the copied fragment; multi-source
copy/cut returns a JSON array payload, keeps `source` as the primary source,
and exposes all `sources` through both `doc.clipboard.sources` and
`doc.clipboard.read()`. `doc.clipboard.copy()` and `doc.clipboard.cut()` use
the current selection when the source is omitted. Manual
`doc.clipboard.write` validates and normalizes source metadata when provided.
`doc.clipboard.paste` uses the primary selection target when the target is
omitted, and spreads multi-source array
payloads back into array targets by default; pass `{ spread: false }` to keep
the array payload as one value. `createClipboard(args)` builds the same buffer
for standalone headless composition with independent ops and selection state.
DOM/system clipboard integration remains user code.

`doc.check` is headless dry-run validation for commands and patches. It returns
the same success/failure family the command would hit, without mutating value,
selection, clipboard, or history.
`doc.check.find(jsonpath)` and `doc.can.find(jsonpath)` validate JSONPath
syntax without running a mutation; syntax failures return `syntax_error`.
It also guards selection cursor and scope commands (`moveCursor`,
`extendCursor`, `selectScope`) and string-leaf text replacement
(`replaceText`) so keyboard and select-visible UI can use `can.x(...) ===
check.x(...).ok` before dispatch.
The schema gate dry-applies the patch and runs whole-document
`schema.safeParse`, so cross-field `.refine` / `.superRefine` violations are
rejected before commit.

`doc.at`, `doc.exists`, `doc.query`, and `doc.entries` are headless read helpers
over the current document value. JSONPath queries return pointers, not values,
and support RFC 9535 function extensions (`length`/`count`/`match`/`search`/`value`).
The vendored RFC 9535 CTS gates full 703/703 conformance.

History metadata is serializable. Use
`doc.commit(patch, { selection, label, origin, mergeKey })` when an editor
command already knows the final caret/range after a patch. Use
`doc.history.transaction({ label, origin, mergeKey }, fn)` to preserve user
intent for synchronous multi-op batches.
Use `createRecorder(doc.ops)` for headless recording and
`createDebugLog(doc.ops, doc.selection)` for headless diagnostic timelines;
`useRecorder` and `useDebugLog` are React facades over the same sidecars.
`replayRecording(recording, doc)` restores recorded selection metadata when it
is present; pass `doc.ops` for state-only replay.
For lower-level composition, `emptyHistory`, `historyCommit`, `historyBack`,
`historyForward`, and `historyMergeLast` expose the same pure stack reducer that
document history uses.

`doc.schema` answers what a path can contain without exposing Zod objects.
It is advisory; commits still go through the schema gate.
For standalone reads and schema introspection, use `createRead(args)` and
`createSchema(args)` with the same headless implementations used by
`createJSONDocument`.

For lower-level composition, use `createSelection(ops)`, `createClipboard(args)`,
and `createDraft(doc)` headlessly, or `useSelection(ops)` / `useDraft(doc)` in React. See the
[`useJSON`](./SPEC.md#51-usejson--data-hook) and
[`useSelection`](./SPEC.md#57-useselection--selection-state-hook) contracts in
SPEC.

## Pure core (no React)

```ts
import * as z from "zod";
import { applyOperation, applyPatch } from "zod-crud";

const Schema = z.object({ title: z.string(), tags: z.array(z.string()) });

const initial = { title: "draft", tags: [] };

const r = applyPatch(Schema, initial, [
  { op: "add", path: "/tags/-", value: "docs" },
  { op: "replace", path: "/title", value: "final" },
]);

if (r.result.ok) {
  console.log(r.state); // { title: "final", tags: ["docs"] }
}
```

Both `applyOperation` and `applyPatch` are pure. Same input, same output.
No React, no instances, no global state. Use them anywhere — server,
Worker, edge runtime, tests.

## Serialization

State, operations, and history records are pure JSON. There is nothing
special to serialize — `JSON.stringify` works directly:

```ts
import * as z from "zod";
import { serialize, parse, safeParse } from "zod-crud";

const Schema = z.object({ title: z.string() });
const state = { title: "draft" };

const json = serialize(state);                // string
const restored = parse(Schema, json);         // throws on schema mismatch
const safe = safeParse(Schema, json);         // returns { ok, ... }
```

`serialize` throws `TypeError` for non-JSON values such as `undefined`,
functions, symbols, `BigInt`, `Date`, `NaN`, circular references, sparse
arrays, and class instances. `applyOperation`/`applyPatch` reject the same
values with `not_serializable`.

Operations are also pure JSON, so they can be sent over the wire and
applied on the server with any RFC 6902 implementation:

```ts
const operations = [{ op: "replace", path: "/title", value: "final" }];

fetch("/api/save", {
  method: "PATCH",
  headers: { "Content-Type": "application/json-patch+json" },
  body: JSON.stringify(operations),
});
```

## API

See [`SPEC.md`](./SPEC.md) §5 for the public surface. Briefly:

| Export | Purpose |
| --- | --- |
| `createJSON(schema, initial, options?)` | headless low-level JSON state owner with the same `JSONOps<T>` surface as `useJSON` |
| `JSONState<T>`, `HeadlessJSONState<T>`, `CreateJSONOptions`, `JSONChangeListener`, `JSONOps<T>`, `UseJSONOptions` | low-level JSON state and ops types |
| `createJSONDocument(schema, initial, options?)` | headless facade with the same `value`/`lastPatch`/`ops`/`commands`/`can`/`check`/`schema`/`selection`/`clipboard`/`history` surface, `commit`, and read/query helpers as `useJSONDocument` |
| `createCommands(args)`, `createCheck(args)`, `createCan(args)` | standalone headless command, dry-run, and boolean guard facades over `JSONDocumentOps` plus optional selection state |
| `Commands<T>`, `Can<T>`, `CommandSelectionState`, `CreateCommandsOptions<S>`, `CreateCheckOptions<S>`, `CreateCanOptions<S>`, `ReplaceCommandResult`, `ReplaceTextCommandResult` | standalone command/check/can composition types |
| `createClipboard(args)` | standalone headless clipboard buffer; composes with independent `JSONOps` and optional selection source/target getters |
| `JSONDocument<T>`, `JSONDocumentCommitOptions`, `JSONDocumentCommitSelection`, `JSONDocumentHistory`, `UseJSONDocumentOptions<T>`, `ClipboardSource`, `ClipboardState<T>`, `CreateClipboardOptions<S>`, `Check<T>`, `CheckResult`, `CheckErrorCode`, `CheckViolation`, `ReadResult`, `QueryResult`, `EntriesResult`, `EntryKind`, `ReadEntry`, `ReadFacade`, `SchemaState<T>`, `SchemaKind`, `SchemaPathMode`, `SchemaQueryResult`, `SchemaKindResult`, `SchemaDescription`, `SchemaDescriptionResult`, `SchemaErrorCode`, `SchemaErrorResult`, `HistoryTransactionOptions`, `HistoryMergeOptions`, `JSONChangeMetadata` | shared headless facade types |
| `useJSONDocument(schema, initial, options?)` from `zod-crud/react` | React facade (SPEC §5.10) |
| `createJSON(schema, initial, options?)` from `zod-crud/react` | same headless low-level JSON state owner re-exported from the React entrypoint |
| `createCommands(args)`, `createCheck(args)`, `createCan(args)` from `zod-crud/react` | same headless command/check/can factories re-exported from the React entrypoint |
| `createClipboard(args)` from `zod-crud/react` | same headless clipboard factory re-exported from the React entrypoint; no React clipboard hook |
| `JSONDocument<T>`, `JSONDocumentCommitOptions`, `JSONDocumentCommitSelection`, `JSONDocumentHistory`, `UseJSONDocumentOptions<T>`, `ClipboardSource`, `ClipboardState<T>`, `CreateClipboardOptions<S>`, `Check<T>`, `CheckResult`, `CheckErrorCode`, `CheckViolation`, `ReadResult`, `QueryResult`, `EntriesResult`, `EntryKind`, `ReadEntry`, `ReadFacade`, `SchemaState<T>`, `SchemaKind`, `SchemaPathMode`, `SchemaQueryResult`, `SchemaKindResult`, `SchemaDescription`, `SchemaDescriptionResult`, `SchemaErrorCode`, `SchemaErrorResult`, `ReplaceTextCommandResult`, `HistoryTransactionOptions`, `HistoryMergeOptions`, `JSONChangeMetadata` from `zod-crud/react` | facade types (SPEC §5.10) |
| `useJSON(schema, initial, options?)` from `zod-crud/react` | lower-level React data hook facade over `createJSON` (SPEC §5.1) |
| `useJSONSlice(ops, pointer)` from `zod-crud/react` | render-safe pointer slice hook |
| `createSelection(ops, options?)` | headless selection/caret state over JSON ops (SPEC §5.7) |
| `useSelection(ops, options?)` from `zod-crud/react` | lower-level React selection hook (SPEC §5.7) |
| `SelectionState<T>`, `HeadlessSelectionState<T>`, `SelectionChangeListener`, `SelectionSource`, `SelectionRangeInput`, `SelectionCursorDirection`, `SelectionCursorErrorCode`, `SelectionCursorOptions`, `SelectionCursorResult`, `SelectionCursorTarget`, `SelectionScopeErrorCode`, `SelectionScopeOptions`, `SelectionScopeResult`, `SelectionScopeTarget`, `UseSelectionOptions`, `CreateSelectionOptions` from `zod-crud/react` | React selection hook types |
| `createDraft(doc, options?)` | headless draft/pending field state over a document facade |
| `useDraft(doc)`, `useField(doc, pointer)` from `zod-crud/react` | draft/pending field helpers |
| `DraftState<T>`, `DraftFieldState<T>`, `HeadlessDraftState<T>`, `DraftChangeListener<T>`, `DraftDocument<T>`, `CreateDraftOptions` from `zod-crud/react` | draft/pending field types |
| `EMPTY_HISTORY`, `emptyHistory`, `historyCommit`, `historyBack`, `historyForward`, `historyMergeLast`, `historyCanUndo`, `historyCanRedo`, `HistoryStack<E>` | pure headless undo/redo stack reducer used by document history |
| `EMPTY_HISTORY`, `emptyHistory`, `historyCommit`, `historyBack`, `historyForward`, `historyMergeLast`, `historyCanUndo`, `historyCanRedo`, `HistoryStack<E>` from `zod-crud/react` | same headless history primitives re-exported from the React entrypoint |
| `createRead(args)`, `ReadFacade`, `ReadResult`, `QueryResult`, `EntriesResult`, `EntryKind`, `ReadEntry`, `CreateReadOptions<S>` | standalone headless read/query facade |
| `createSchema(args)`, `SchemaState<T>`, `SchemaKind`, `SchemaPathMode`, `SchemaQueryResult`, `SchemaKindResult`, `SchemaDescription`, `SchemaDescriptionResult`, `SchemaErrorCode`, `SchemaErrorResult`, `CreateSchemaOptions<S>` | standalone serializable schema introspection facade |
| `createRead(args)`, `ReadFacade`, `CreateReadOptions<S>`, `createSchema(args)`, `SchemaState<T>`, `CreateSchemaOptions<S>` from `zod-crud/react` | same headless read/schema factories re-exported from the React entrypoint |
| `JSONOps<T>` | low-level ops contract (SPEC §5.2) |
| `trackPointer` | low-level pointer tracking helper (SPEC §5.8) |
| `applyOperation(schema, state, op)` | pure single-op (SPEC §5.3) |
| `applyPatch(schema, state, ops)` | pure batch (SPEC §5.3) |
| `JSONPatchOperation`, `JSONResult`, `ErrorCode`, `ApplyResult` | RFC 6902 types (SPEC §3, §5.3) |
| `Pointer`, `PointerOf<T>`, `ValueAt<T,P>` | path types (SPEC §2, §5.4) |
| `parsePointer`, `tryParsePointer`, `buildPointer`, `escapeSegment`, `unescapeSegment`, `parentPointer`, `lastSegment`, `lastSegmentIndex`, `appendSegment`, `withLastSegment` | RFC 6901 helpers (SPEC §5.6) |
| `serialize`, `parse`, `safeParse`, `jsonEqual`, `JSONPrimitive`, `JSONValue` | JSON helpers (SPEC §5.5) |
| `buildPatchRequest`, `withIfMatch`, `parsePatchResponse` | HTTP PATCH wire helpers (SPEC §5.9) |
| `PatchRequest`, `ParseResult`, `ParseError` | HTTP sidecar types (SPEC §5.9) |
| `createRecorder`, `replayRecording`, `RecorderApi<T>`, `HeadlessRecorderApi<T>`, `CreateRecorderOptions`, `Recording<T>`, `RecordedStep`, `ReplayTarget<T>`, `ReplayDocumentTarget<T>`, `ReplaySelectionTarget`, `ReplayOptions` | replayable JSON recording sidecar (SPEC §5) |
| `createDebugLog`, `DebugLog<T>`, `DebugLogApi<T>`, `DebugLogger`, `DebugEvent`, `HeadlessDebugLogApi<T>`, `CreateDebugLogOptions` | headless diagnostic timeline sidecar (SPEC §5) |
| `useRecorder`, `RecorderApi<T>` from `zod-crud/react` | React recording hook (SPEC §5) |
| `useDebugLog`, `DebugLog<T>`, `DebugLogApi<T>`, `DebugLogger` from `zod-crud/react` | React diagnostic log hook (SPEC §5) |
| `JSONCrudError`, `PointerSyntaxError` | error classes (SPEC §6.3) |
| `computeInverses` | RFC 6902 inverse helper |
| `copy`, `toClipboardItems`, `toMarkdown`, `toTsv`, `paste`, `duplicate`, `cut`, `find`, `queryPointers`, `move`, `redo`, `replace`, `select`, `undo` | headless edit verbs |
| `zod-crud/verbs/copy`, `zod-crud/verbs/cut`, `zod-crud/verbs/duplicate`, `zod-crud/verbs/find`, `zod-crud/verbs/move`, `zod-crud/verbs/paste`, `zod-crud/verbs/redo`, `zod-crud/verbs/replace`, `zod-crud/verbs/select`, `zod-crud/verbs/undo` | direct headless verb subpaths |
| `ClipboardEmpty`, `ClipboardItemMap`, `ClipboardItemOptions`, `ClipboardPasteResult`, `ClipboardReadOk`, `ClipboardReadResult`, `ClipboardSource`, `ClipboardWriteOptions`, `CopyError`, `CopyOk`, `CopyResult`, `CutError`, `CutOk`, `DuplicateError`, `DuplicateOk`, `DuplicateOpts`, `FindError`, `FindOk`, `MoveError`, `MoveOk`, `MoveResult`, `PasteDuMismatch`, `PasteError`, `PasteMode`, `PasteOk`, `PasteOptions`, `RedoResult`, `RekeyContext`, `RekeyOptions`, `RekeyResult`, `RekeyStrategy`, `ReplaceError`, `ReplaceOk`, `JSONPoint`, `SelectionAction`, `SelectionAffinity`, `SelectionContext`, `SelectionEdge`, `SelectionRange`, `SelectionRangeInput`, `SelectionSnap`, `SelectionSource`, `UndoEntry`, `UndoNoop`, `UndoResult` | headless edit verb types |
| `parseMergePatch`, `applyMergePatch`, `JSON_PATCH_MIME`, `MERGE_PATCH_MIME` | HTTP PATCH / Merge Patch helpers |
| `EMPTY_SELECTION`, `anchorPointer`, `caretPoint`, `caretPointer`, `focusPointer`, `hasSelection`, `isCollapsed`, `isSelected`, `pointPointer`, `primaryPointer`, `primaryRange`, `rangeCount`, `restoreSelection`, `selectedCount`, `selectedSource`, `selectionSnapshot`, `selectionType`, `moveSelectionCursor`, `extendSelectionCursor`, `resolveSelectionCursor`, `selectSelectionScope`, `resolveSelectionScope`, `compareSelectionPoints`, `orderSelectionRange`, `orderPrimarySelectionRange`, `orderSelectionRanges`, `selectionSpansForPointer`, `selectionTextEdits`, `replaceSelectionText`, `SelectionContext`, `SelectionMode`, `SelectionRangeInput`, `SelectionType`, `SelectionCursorDirection`, `SelectionCursorErrorCode`, `SelectionCursorOptions`, `SelectionCursorResult`, `SelectionCursorTarget`, `SelectionDirection`, `SelectionOrderErrorCode`, `SelectionOrderOptions`, `SelectionPointOrderResult`, `SelectionPointerSpan`, `SelectionPointerSpansResult`, `SelectionSpanOptions`, `SelectionTextEdit`, `SelectionTextEditErrorCode`, `SelectionTextEditOptions`, `SelectionTextEditsResult`, `ReplaceSelectionTextResult`, `OrderedSelectionRange`, `OrderedSelectionRangeEntry`, `SelectionRangeOrderResult`, `SelectionRangesOrderResult`, `SelectionScopeErrorCode`, `SelectionScopeOptions`, `SelectionScopeResult`, `SelectionScopeTarget`, `SelectionState<T>`, `HeadlessSelectionState<T>`, `SelectionChangeListener`, `UseSelectionOptions`, `CreateSelectionOptions` | selection primitives |
| `toJSONSchema`, `fromJSONSchema`, `PreFlightErrorCode` | JSON Schema bridge and schema preflight types |
| `JSONLoadOptions`, `UseJSONOptions`, `JSONChangeMetadata`, `HistoryTransactionOptions`, `HistoryMergeOptions` | low-level ops and history metadata options |

## Guarantees

The library always upholds the SPEC §7 invariants:

- **G1** — `JSON.parse(JSON.stringify(state))` deeply equals `state`
- **G2** — operations never mutate input state
- **G3** — committed state always passes `schema.safeParse`
- **G4** — `applyPatch` is interoperable with other RFC 6902 implementations
- **G5** — pointers are interpreted exactly as RFC 6901
- **G6** — `applyOperation`/`applyPatch` are pure
- **G7** — history undo→redo round-trips
- **G8** — batch failure leaves state unchanged

These are exercised by `test/rfc6902.test.ts`, `test/guarantees.test.ts`,
`test/serialize.test.ts`, and `test/pointer-types.test.ts`.
