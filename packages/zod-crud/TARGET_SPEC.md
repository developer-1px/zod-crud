# zod-crud — Target Specification

**Status: target specification.** This document defines the intended engine
surface. It is not a claim about current package behavior. Current behavior is
specified in [`SPEC.md`](./SPEC.md) and exported from `src/index.ts` /
`src/react.ts`.

## 0. Vision

**All frontend editing is JSON editing.**

FE applications that need save, undo, replay, collaboration boundaries, server
sync, or inspection eventually need a JSON-compatible document model for their
editing state. zod-crud is the headless JSON editing engine for that document
state.

The engine owns the edit state and the edit grammar. Applications own visual
rendering and input interpretation.

## 1. Contract

zod-crud provides the primitives every editor-like FE rebuilds:

- schema-safe JSON document state
- RFC 6901 coordinates
- RFC 6902 mutation
- selection/caret over JSON coordinates
- clipboard fragments
- undo/redo history
- command, guard, and diagnostic facade
- replayable operation streams
- wire-safe JSON serialization

zod-crud does not provide:

- visual components
- DOM event mapping
- keyboard shortcut presets
- `navigator.clipboard` calls
- drag/drop DOM policy
- app-specific navigation order
- persistence backend
- CRDT/OT conflict policy

## 2. Target Facade

The headless facade is the product surface. The React facade must expose the
same editing surface with React render lifecycle added.

```ts
const json = createJSON(Schema, initial);
const doc = createJSONDocument(Schema, initial, options);
const doc = useJSONDocument(Schema, initial, options);
```

Target `JSONDocument<T>`:

```ts
interface JSONDocument<T> {
  readonly value: T;
  readonly lastPatch: ReadonlyArray<JSONPatchOperation>;
  readonly ops: JSONDocumentOps<T>;
  readonly commands: Commands<T>;
  readonly can: Can<T>;
  readonly check: Check<T>;
  readonly selection: SelectionState<T> | undefined;
  readonly clipboard: ClipboardState<T>;
  readonly history: JSONDocumentHistory;
  readonly schema: SchemaState<T>;

  commit(operations: ReadonlyArray<JSONPatchOperation>, options?: JSONDocumentCommitOptions): JSONResult;
  at(path: Pointer): ReadResult;
  exists(path: Pointer): boolean;
  query(jsonpath: string): QueryResult;
  entries(path: Pointer): EntriesResult;
}
```

Rules:

- `createJSONDocument` is authoritative for behavior.
- `createJSON` is the standalone low-level state owner for `JSONOps<T>`.
- `useJSONDocument` is an adapter over the same behavior.
- `useJSON` is a React facade over `createJSON`.
- Every facade field must be serializable or expose serializable snapshots.
- No facade field may require React, DOM, browser APIs, or timers.

## 3. Clipboard Subsystem

Current pure verbs (`copy`, `cut`, `paste`) remain exported. The current facade
also includes a headless JSON clipboard buffer.

```ts
type ClipboardSource = Pointer | ReadonlyArray<Pointer>;

type ClipboardReadOk = {
  ok: true;
  payload: unknown;
  source: Pointer | null;
  sources: ReadonlyArray<Pointer> | null;
};

interface ClipboardState<T> {
  readonly hasData: boolean;
  readonly source: Pointer | null;
  readonly sources: ReadonlyArray<Pointer> | null;
  read(): ClipboardReadResult;
  write(payload: unknown, options?: ClipboardWriteOptions): JSONResult;
  clear(): void;

  copy(source?: ClipboardSource): CopyOk | CopyError;
  cut(source?: ClipboardSource): CutOk<T> | CutError;
  paste(
    targetOrMode?: Pointer | PasteMode,
    modeOrOptions?: PasteMode | PasteOptions,
    options?: PasteOptions,
  ): ClipboardPasteResult<T>;
  toItems(options?: ClipboardItemOptions): ClipboardItemMap;
}
```

Semantics:

- The buffer stores a JSON fragment and optional source/source-list metadata. `read()` returns both.
- `write(payload, options)` validates and normalizes source metadata when provided.
- `copy(source?)` reads one `Pointer` or a `Pointer[]` from document state and writes buffer. If source is omitted, it uses the current selection source.
- `cut(source?)` writes buffer and commits one remove patch atomically; multi-source cut keeps first occurrences, prunes covered descendants, and sorts remove ops to avoid array index shift. If source is omitted, it uses the current selection source.
- `paste(targetOrMode?, modeOrOptions?, options?)` reads buffer and commits the paste patch. If target is omitted, it uses the current primary selection target; mode-only calls such as `paste("after")` use that same target. Multi-source array payloads spread into array targets by default; pass `{ spread: false }` to keep the array payload as one value.
- Failed paste does not clear or mutate the buffer.
- Failed cut does not write buffer and does not mutate document state.
- DOM/system clipboard integration remains user code.

Acceptance evidence:

- Headless tests in `tests/create-json-document.test.ts` prove copy -> paste,
  cut -> undo, failed paste preserves buffer, and non-JSON payloads are rejected.
- React facade tests in `tests/document-clipboard-react.test.ts` prove the same
  behavior through `useJSONDocument`.

## 4. Check Subsystem

`can` is a boolean UI guard. A document engine also needs explainable failure.

```ts
type CheckResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | ErrorCode
        | PreFlightErrorCode
        | "du_branch_mismatch"
        | "rekey_failed"
        | "missing_new_key"
        | "key_conflict"
        | "empty_selection"
        | "empty_scope"
        | "empty_match"
        | "cursor_boundary"
        | "syntax_error"
        | "empty_stack"
        | "apply_failed";
      reason?: string;
      pointer?: Pointer;
      violations?: ReadonlyArray<{ path: string; message: string }>;
    };

interface Check<T> {
  selectScope(options?: SelectionScopeOptions): CheckResult;
  moveCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): CheckResult;
  extendCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): CheckResult;
  find(jsonpath: string): CheckResult;
  move(fromOrTo: Pointer, to?: Pointer): CheckResult;
  duplicate(sourceOrOpts?: Pointer | DuplicateOpts, opts?: DuplicateOpts): CheckResult;
  replace(pathOrValue: Pointer | unknown, value?: unknown): CheckResult;
  cut(source?: ClipboardSource): CheckResult;
  copy(source?: ClipboardSource): CheckResult;
  paste(
    payload: unknown,
    targetOrMode?: Pointer | PasteMode,
    modeOrOptions?: PasteMode | PasteOptions,
    options?: PasteOptions,
  ): CheckResult;
  patch(ops: ReadonlyArray<JSONPatchOperation>): CheckResult;

  readonly undo: CheckResult;
  readonly redo: CheckResult;
}
```

Rules:

- `can.x(...) === check.x(...).ok`.
- `check` must not mutate document state, selection, clipboard, or history.
- `check` reports the same code family the actual command would produce.
- `check.find(jsonpath)` validates JSONPath syntax without mutating state;
  syntax failures use `syntax_error`.
- Selection cursor and scope checks guard `commands.moveCursor`,
  `commands.extendCursor`, and `commands.selectScope`; boundary failures use
  `cursor_boundary`, and empty scope failures use `empty_scope`.

Acceptance evidence:

- Headless tests in `tests/document-check.test.ts` cover schema violation,
  invalid pointer, path missing, discriminated union paste mismatch, undo/redo
  unavailable, JSONPath find syntax, selection cursor/scope availability,
  dry-run immutability, and `can === check.ok`.
- React facade tests in `tests/document-clipboard-react.test.ts` prove the same
  check surface exists through `useJSONDocument`.

## 5. Read / Query Subsystem

Generic FE editors need pointer-based reading without reimplementing path
logic.

```ts
type ReadResult =
  | { ok: true; path: Pointer; value: unknown }
  | { ok: false; code: "invalid_pointer" | "path_not_found"; reason?: string; pointer: Pointer };

type QueryResult =
  | { ok: true; query: string; pointers: Pointer[] }
  | { ok: false; code: "invalid_query"; reason?: string };

type EntryKind = "root" | "object" | "array" | "record" | "primitive";

type EntriesResult =
  | {
      ok: true;
      path: Pointer;
      kind: EntryKind;
      entries: ReadonlyArray<{ key: string; path: Pointer; value: unknown }>;
    }
  | { ok: false; code: "invalid_pointer" | "path_not_found"; reason?: string; pointer: Pointer };
```

Rules:

- `at("")` reads the whole document.
- `exists(path)` is `at(path).ok`.
- `query(jsonpath)` returns pointers, not values.
- `entries(path)` is state-based; app-specific visible navigation order remains
  user code.

Acceptance evidence:

- Headless tests in `tests/document-read.test.ts` cover root, object, array,
  record, primitive, invalid pointer, path missing, existence, current-state
  reads after edits, and JSONPath query.
- React facade tests in `tests/document-read-react.test.ts` prove the same read
  surface exists through `useJSONDocument`.

## 6. Selection Subsystem

Selection is a first-class engine subsystem. Current source of truth is
`SPEC.md` §5.7. The target facade keeps selection headless, JSON-serializable,
and shared by `createJSONDocument` and `useJSONDocument`.
`createSelection(ops)` is the headless state owner; React `useSelection(ops)`
is only a facade over it.
`createDraft(doc)` is the headless draft/pending-field owner; React
`useDraft(doc)` and `useField(doc, pointer)` are facades over it.

```ts
type JSONPoint =
  | Pointer
  | {
      path: Pointer;
      offset?: number;
      edge?: "before" | "after";
      affinity?: "forward" | "backward";
    };

interface SelectionRange {
  anchor: JSONPoint;
  focus: JSONPoint;
}

type SelectionSource = Pointer | ReadonlyArray<Pointer>;
type SelectionCursorDirection = "first" | "previous" | "next" | "last";

interface SelectionCursorOptions {
  points?: ReadonlyArray<JSONPoint>;
  query?: string;
  scope?: Pointer;
  includeScope?: boolean;
  wrap?: boolean;
}

interface SelectionScopeOptions {
  points?: ReadonlyArray<JSONPoint>;
  query?: string;
  scope?: Pointer;
  includeScope?: boolean;
  primaryIndex?: number;
}

type SelectionCursorErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "syntax_error"
  | "empty_scope"
  | "cursor_boundary";

type SelectionCursorResult =
  | {
      ok: true;
      direction: SelectionCursorDirection;
      pointer: Pointer;
      point: JSONPoint;
      previousPointer: Pointer | null;
      selection: SelectionSnap;
    }
  | {
      ok: false;
      direction: SelectionCursorDirection;
      code: SelectionCursorErrorCode;
      reason: string;
      pointer: Pointer | null;
      selection: SelectionSnap;
    };

type SelectionScopeResult =
  | {
      ok: true;
      points: ReadonlyArray<JSONPoint>;
      selection: SelectionSnap;
    }
  | {
      ok: false;
      code: "invalid_pointer" | "path_not_found" | "syntax_error" | "empty_scope";
      reason: string;
      pointer: Pointer | null;
      selection: SelectionSnap;
    };

type SelectionDirection = "forward" | "backward" | "none";
type SelectionOrderErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "syntax_error"
  | "empty_scope"
  | "point_not_in_order"
  | "empty_selection";

interface SelectionOrderOptions {
  points?: ReadonlyArray<JSONPoint>;
  query?: string;
  scope?: Pointer;
  includeScope?: boolean;
}

interface OrderedSelectionRange {
  anchor: JSONPoint;
  focus: JSONPoint;
  start: JSONPoint;
  end: JSONPoint;
  direction: SelectionDirection;
  collapsed: boolean;
}

type SelectionPointOrderResult =
  | {
      ok: true;
      order: -1 | 0 | 1;
      direction: SelectionDirection;
      left: JSONPoint;
      right: JSONPoint;
      leftPointer: Pointer;
      rightPointer: Pointer;
    }
  | {
      ok: false;
      code: SelectionOrderErrorCode;
      reason: string;
      pointer: Pointer | null;
    };

type SelectionRangeOrderResult =
  | { ok: true; range: OrderedSelectionRange }
  | {
      ok: false;
      code: SelectionOrderErrorCode;
      reason: string;
      pointer: Pointer | null;
    };

interface SelectionState<T> {
  readonly ranges: ReadonlyArray<Pointer>;           // legacy selected pointer projection
  readonly selectedPointers: ReadonlyArray<Pointer>;
  readonly selectionRanges: ReadonlyArray<SelectionRange>;
  readonly primaryIndex: number;
  readonly rangeCount: number;
  readonly selectedCount: number;
  readonly hasSelection: boolean;
  readonly primaryRange: SelectionRange | null;
  readonly anchor: JSONPoint | null;
  readonly anchorPointer: Pointer | null;
  readonly focus: JSONPoint | null;
  readonly focusPointer: Pointer | null;
  readonly selectedSource: SelectionSource | null;
  readonly primaryPointer: Pointer | null;
  readonly caret: JSONPoint | null;
  readonly caretPointer: Pointer | null;
  readonly context: JSONValue | undefined;
  readonly isCollapsed: boolean;
  readonly type: SelectionType;

  collapse(point: JSONPoint): void;
  setBaseAndExtent(anchor: JSONPoint, focus: JSONPoint): void;
  extend(point: JSONPoint): void;
  addRange(pointOrRange: JSONPoint | SelectionRange): void;
  removeRange(pointOrRangeOrIndex: JSONPoint | SelectionRange | number): void;
  toggleRange(pointOrRange: JSONPoint | SelectionRange): void;
  togglePointer(pointer: Pointer): void;
  moveCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): SelectionCursorResult;
  extendCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): SelectionCursorResult;
  resolveCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): SelectionCursorResult;
  orderPrimaryRange(options?: SelectionOrderOptions): SelectionRangeOrderResult;
  selectScope(options?: SelectionScopeOptions): SelectionScopeResult;
  resolveScope(options?: SelectionScopeOptions): Omit<SelectionScopeResult, "selection">;
  selectRanges(
    ranges: ReadonlyArray<JSONPoint | SelectionRange>,
    anchor?: JSONPoint | null,
    focus?: JSONPoint | null,
    primaryIndex?: number,
  ): void;
  setContext(context: JSONValue): void;
  clearContext(): void;
  empty(): void;
  isSelected(pointer: Pointer): boolean;
  containsNode(pointer: Pointer): boolean;
  snapshot(): SelectionSnap;
  toJSON(): SelectionSnap;
  restore(snapshot: SelectionSnap): void;
  subscribe(listener: SelectionChangeListener): () => void;
}
```

`commands.select` mutates document selection and returns the computed snapshot.
`commands.moveCursor` and `commands.extendCursor` mutate document selection for
keyboard-style cursor movement using the same cursor traversal options.
`commands.selectScope` uses the document's configured selection mode to expose
Ctrl+A/select-visible selection through the command namespace.
`check.moveCursor` / `can.moveCursor`, `check.extendCursor` /
`can.extendCursor`, and `check.selectScope` / `can.selectScope` expose the
same availability checks without mutating selection.
`selectionRanges[primaryIndex]` is the primary command range. Pointer-only
selection remains valid via `JSONPoint = Pointer`; offset/edge points model text
carets and item-boundary carets. `anchorPointer`, `focusPointer`,
`primaryPointer`, and `caretPointer` are Pointer projections for command wiring.
`UseSelectionOptions.initial` and `selectRanges` accept `JSONPoint` or
`{ anchor, focus }` ranges, so apps can seed disjoint multi-range selection and
offset/edge carets without React.
`moveSelectionCursor`, `extendSelectionCursor`, and `resolveSelectionCursor`
are pure headless helpers over a `SelectionSnap` plus current JSON state.
They use JSON source-order DFS within `scope` by default, or explicit
`query` JSONPath results for find-driven order, or explicit `points` for
filtered, folded, virtualized, or otherwise app-visible order. `points` takes
precedence over `query`, and both bypass `scope` traversal.
`selectSelectionScope` and `resolveSelectionScope` use the same traversal
options for Ctrl+A/select-visible style selection without requiring React; this
includes selecting all JSONPath find results through `query`.
`compareSelectionPoints`, `orderSelectionRange`, and
`orderPrimarySelectionRange` are pure helpers that turn directional
anchor/focus endpoints into document-order `start`/`end` ranges. They use JSON
source-order by default, JSONPath `query` order when provided, or explicit
visible `points` order for folded/virtualized UIs. Same-path offsets compare by
numeric order, and an ancestor point with `edge: "after"` sorts after its
descendants. `SelectionState` exposes the same behavior as
`orderPrimaryRange(options?)`.
Standalone headless composition uses `createSelection(ops)` and
`createClipboard(args)`; `useSelection` adds React render invalidation but no
separate selection model, and React has no separate clipboard model.
`subscribe` emits JSON-safe `SelectionSnap` transitions after manual selection
actions and automatic op tracking.
`selectedSource` is `null | Pointer | Pointer[]`. Document-facade
`commands.copy()` / `commands.cut()`, `doc.clipboard.copy()` /
`doc.clipboard.cut()`, `check.copy()` / `check.cut()`, and `can.copy()` /
`can.cut()` use it when their source argument is omitted.
Document-facade `commands.move(to)`, `check.move(to)`, and `can.move(to)` use
`primaryPointer` when their source argument is omitted; the target remains an
explicit Pointer.
Document-facade `commands.duplicate()`, `check.duplicate()`, and
`can.duplicate()` use `primaryPointer` when their source argument is omitted;
opts-only calls such as `commands.duplicate({ newKey })` use that same source.
Document-facade `commands.replace(value)`, `check.replace(value)`, and
`can.replace(value)` use `primaryPointer` when their path argument is omitted.
When the explicit first argument is a JSONPath string, `commands.replace`
commits the pure `replace` verb's atomic multi-match batch, and `check.replace`
/ `can.replace` dry-run that same batch; no matches report `empty_match`.
Document-facade `commands.paste(payload)`, `doc.clipboard.paste()`,
`check.paste(payload)`, and `can.paste(payload)` use `primaryPointer` when
their target argument is omitted; mode-only calls such as
`commands.paste(payload, "after")` use that same target.
`selectedCount` and `hasSelection` are item-selection projection helpers for
rendering and command guards. `isSelected(pointer)` is the per-item selected
predicate; `togglePointer(pointer)` toggles one item in the `selectedPointers`
projection, including removing a pointer from inside an expanded range while
preserving the remaining items as sparse collapsed ranges.
`containsNode(pointer)` remains an exact selected-pointer alias.
Selection getters, `snapshot()`, and `toJSON()` expose value snapshots:
returned arrays/ranges/JSONPoint objects are safe to store or mutate outside
the engine. `JSON.stringify(doc.selection)` serializes the same `SelectionSnap`
as `doc.selection.snapshot()`, and `doc.selection.restore(snapshot)` restores
that wire-safe snapshot.
`context` is optional JSON-serializable selection-local editing state. It is
for stored marks, active tools, find mode, or similar caret/selection state
that should not be written into document JSON. Cursor movement and mutation
tracking preserve it; `setContext`, `clearContext`, initial selection options,
and `SelectionAction.context` replace or clear it.

Rules:

- Offset-bearing points are allowed only where the value at `path` supports an
  offset domain, such as string text or app-declared sequence fields.
- String caret offsets are clamped to the current string length when state is
  available, including after document edits that keep the same Pointer alive.
- Selection snapshots remain JSON serializable.
- Selection snapshots clone object coordinates and context; external mutation
  does not mutate live selection state.
- RFC 6902 mutation drives automatic path tracking. Offset/edge/affinity are
  preserved when the underlying `path` tracks to a new Pointer.
- Cursor movement is source-order and state-based. It reports
  `cursor_boundary` instead of mutating when next/previous would leave scope
  and `wrap` is false.
- Explicit cursor `points` preserve `JSONPoint` offsets/edges/affinity, so text
  cursor positions and item cursor positions use the same engine path.
- Cursor and scope `query` options use RFC 9535 JSONPath and report
  `syntax_error` without mutating selection when the query is invalid.

Acceptance evidence:

- `tests/verbs.test.ts` covers Pointer selection, JSONPoint caret, and multiple
  independent ranges.
- `tests/selection-headless.test.ts` covers pure cursor helpers, query-driven
  cursor/scope traversal, selection range ordering, and `createSelection`
  cursor movement/extension.
- `tests/create-json-document.test.ts` covers `commands.select` mutation,
  `commands.selectScope({ query })`, and JSONPoint path tracking through
  document patches.

## 7. History Subsystem

History already owns undo/redo/merge/transaction. Target history adds
serializable metadata for user-intent grouping and recording.

```ts
interface HistoryTransactionOptions {
  label?: string;
  origin?: "keyboard" | "pointer" | "programmatic" | string;
  mergeKey?: string;
}

interface JSONDocumentHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
  mergeLast(options?: { mergeKey?: string }): boolean;
  transaction(fn: () => void): void;
  transaction(options: HistoryTransactionOptions, fn: () => void): void;
}

interface JSONDocumentCommitOptions extends HistoryTransactionOptions {
  selection?: SelectionAction | SelectionSnap;
}
```

Standalone lower-level composition uses `emptyHistory`, `historyCommit`,
`historyBack`, `historyForward`, `historyMergeLast`, `historyCanUndo`, and
`historyCanRedo`; these are the same pure reducer primitives used by document
history.

Rules:

- Time-based coalescing remains app/sidecar policy.
- Core may store `mergeKey`, but must not own timers.
- Recording sidecars preserve history metadata when present.
- `doc.commit(patch, { selection, label, origin, mergeKey })` records patch
  and final selection in one history entry. Selection context is part of the
  final selection snapshot and is restored by undo/redo. Empty patch +
  selection is selection-only and does not create an undo entry.
- `doc.lastPatch` exposes the last applied normalized document patch as a
  serializable value snapshot and clears to `[]` after selection-only edits.
- Recording can be produced headlessly with `createRecorder(ops)`; React
  `useRecorder` is a facade over it.
- Diagnostic timelines can be produced headlessly with
  `createDebugLog(ops, selection?)`; React `useDebugLog` is a facade over it.

Acceptance evidence:

- Headless tests in `tests/document-history-metadata.test.ts` prove transaction
  metadata is serializable, undo/redo state is unchanged, and merge metadata
  does not change stack behavior.
- React recorder tests in `tests/recorder-hook.test.ts` prove recordings
  preserve transaction metadata and optional selection snapshots.

## 7.1 Command / Guard Subsystem

Standalone lower-level composition uses `createCommands(args)`,
`createCheck(args)`, and `createCan(args)` for the same selection-aware command
verbs, dry-run checks, and boolean guards exposed by `createJSONDocument`.
React re-exports the same factories and does not own a separate command model.

## 8. Schema Subsystem

Generic editors need to ask what a path can contain. The target schema facade
exposes read-only introspection without leaking Zod internals as the primary
API.

Standalone lower-level composition uses `createRead(args)` for current-value
Pointer/JSONPath reads and `createSchema(args)` for serializable schema
introspection. React re-exports the same factories and does not own a separate
read/schema model.

```ts
interface SchemaState<T> {
  at(path: Pointer, mode?: "value" | "insert"): SchemaQueryResult;
  kind(path: Pointer, mode?: "value" | "insert"): SchemaKindResult;
  accepts(path: Pointer, value: unknown, mode?: "value" | "insert"): CheckResult;
  describe(path: Pointer, mode?: "value" | "insert"): SchemaDescriptionResult;
}
```

Rules:

- Schema introspection is advisory; commits are still validated by the schema
  gate.
- Results must be serializable.
- Zod stays the runtime schema authority.

Acceptance evidence:

- Headless tests in `tests/document-schema.test.ts` cover object property,
  array insert item, record value, discriminated union branch, invalid pointer,
  unknown path, serializable descriptions, and `accepts` without mutation.
- React facade tests in `tests/document-schema-react.test.ts` prove the same
  schema surface exists through `useJSONDocument`.

## 9. Replay / Wire Subsystem

Replay and wire helpers remain sidecars, but target metadata makes them engine
grade.

Target recording step:

```ts
interface RecordedStep {
  ops: ReadonlyArray<JSONPatchOperation>;
  at: number;
  label?: string;
  origin?: string;
  mergeKey?: string;
  selectionBefore?: SelectionSnap;
  selectionAfter?: SelectionSnap;
}
```

Rules:

- Recording is still JSON.
- Recording can be produced headlessly with `createRecorder(ops)`; React
  `useRecorder` is a facade over it.
- Debug logs can be produced headlessly with `createDebugLog(ops, selection?)`;
  React `useDebugLog` is a facade over it.
- Replay accepts either `JSONOps<T>` for state-only replay or a document facade
  target for state + selection replay.
- Replay restores `selectionBefore` before the first step and `selectionAfter`
  after each step when metadata is present and the target exposes selection.

Acceptance evidence:

- Tests prove old recordings without metadata still replay.
- Headless and React tests prove recordings with selection metadata restore the
  target selection.
- Tests prove new recordings preserve metadata and optional selection snaps.

## 10. Issue Slices

Current facade expansion slices are implemented. Continue from open standards
and engine-hardening items in `BACKLOG.md`.

## 11. Completion Gates

The target spec is implemented only when all gates pass:

- Root `zod-crud` exports all target headless types and functions without
  requiring React.
- `zod-crud/react` exposes the same document facade plus React-only helpers.
- `npm run verify` passes.
- Package smoke tests cover root, React, and any new subpath exports.
- Site docs for new APIs use source-backed references where code snippets are
  copied from repo files.
- `llms.txt` names the new current API only after it is implemented.
