# zod-crud — Canonical Specification

**Status: living specification.** 현재 코드 동작이 정본이며, 코드·문서·테스트가 충돌하면 코드 동작을 확인하고 문서를 갱신한다.

## 0. Identity

zod-crud는 Zod schema로 보호되는 headless JSON editing engine이다. public interface는 JSON 표준 어휘와 FE 편집 도구 어휘를 섞지 않고 다음 축으로 나눈다.

```txt
document
├─ patch(patch)
├─ duplicate(pointer, options)
├─ at(pointer)
├─ query(jsonPath)
├─ selection
├─ clipboard
├─ history
└─ can*
```

UI rendering, DOM event mapping, visual selection drawing, system clipboard access, drag and drop, keyboard shortcut policy는 라이브러리 본체가 아니다.

## 1. Normative References

| Standard | Role |
| --- | --- |
| RFC 8259 / ECMA-404 JSON | state, payload, metadata serialization |
| RFC 6901 JSON Pointer | exact document address |
| RFC 6902 JSON Patch | mutation format |
| RFC 9535 JSONPath | query format |
| W3C Selection vocabulary | anchor, focus, range, caret naming |
| Zod 4 | schema validation |
| React >=18 | optional `zod-crud/react` hook entrypoint |

Rules:

- Patch paths are JSON Pointer.
- Query input is JSONPath.
- Query output is Pointer.
- JSONPath is never a patch target.
- State, patch operations, selection snapshots, clipboard payloads, and history metadata must be JSON-serializable.

## 2. Public Entrypoints

Root entrypoint:

```ts
import {
  JSONCrudError,
  createJSONDocument,
  applyOperation,
  applyPatch,
  parsePointer,
  tryParsePointer,
  buildPointer,
  escapeSegment,
  unescapeSegment,
  PointerSyntaxError,
  parentPointer,
  lastSegment,
  lastSegmentIndex,
  appendSegment,
  withLastSegment,
  trackPointer,
  type HistoryTransactionOptions,
  type JSONCapabilityResult,
  type JSONChangeMetadata,
  type JSONDocument,
  type JSONDocumentChangeListener,
  type JSONDocumentCommitOptions,
  type JSONDocumentCommitSelection,
  type JSONDocumentDuplicateOptions,
  type JSONDocumentDuplicateResult,
  type JSONDocumentHistory,
  type JSONDocumentLoadOptions,
  type JSONDocumentMutationOk,
  type JSONDocumentPasteOptions,
  type JSONDocumentPasteTarget,
  type JSONPatchInput,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
  type JSONPoint,
  type SelectionAction,
  type SelectionRange,
  type SelectionSource,
  type SelectionSnap,
  type SelectionState,
} from "zod-crud";
```

React entrypoint:

```ts
import { useJSONDocument } from "zod-crud/react";
```

`createJSONDocument` and `useJSONDocument` expose the same `JSONDocument<T>` surface.

## 3. JSONDocument Surface

```ts
interface JSONDocumentMutationOk<T> {
  ok: true;
  value: T;
  applied: readonly JSONPatchOperation[];
}

interface JSONDocumentDuplicateOk<T> extends JSONDocumentMutationOk<T> {
  duplicatedTo: Pointer;
}

interface JSONDocument<T> {
  readonly value: T;
  readonly lastPatch: readonly JSONPatchOperation[];
  readonly selection: SelectionState<T> | undefined;
  readonly clipboard: ClipboardState<T>;
  readonly history: JSONDocumentHistory;
  readonly schema: SchemaState<T>;

  patch(operations: JSONPatchInput, metadata?: JSONChangeMetadata): JSONResult;
  commit(operations: readonly JSONPatchOperation[], options?: JSONDocumentCommitOptions): JSONResult;
  duplicate(source: Pointer, options?: JSONDocumentDuplicateOptions): JSONDocumentDuplicateResult<T>;
  load(value: T, options?: JSONDocumentLoadOptions): JSONResult;
  reset(value?: T): JSONResult;
  subscribe(listener: JSONDocumentChangeListener): () => void;

  at(path: Pointer): ReadResult;
  exists(path: Pointer): boolean;
  query(jsonPath: string): QueryResult;
  entries(path: Pointer): EntriesResult;

  canPatch(operations: JSONPatchInput): JSONCapabilityResult;
  canFind(jsonPath: string): JSONCapabilityResult;
  canReplace(path: Pointer, value: unknown): JSONCapabilityResult;
  canRemove(source: SelectionSource): JSONCapabilityResult;
  canMove(source: Pointer, target: Pointer): JSONCapabilityResult;
  canDuplicate(source: Pointer, options?: JSONDocumentDuplicateOptions): JSONCapabilityResult;
  canCopy(source: SelectionSource): JSONCapabilityResult;
  canCut(source: SelectionSource): JSONCapabilityResult;
  canPaste(target: JSONDocumentPasteTarget, options?: PasteOptions): JSONCapabilityResult;
  canPastePayload(target: JSONDocumentPasteTarget, payload: unknown, options?: PasteOptions): JSONCapabilityResult;
  canUndo(): JSONCapabilityResult;
  canRedo(): JSONCapabilityResult;
}
```

`can*` returns a reasoned result, not a boolean.

## 4. Document Mutation

`patch` is the primary mutation entrypoint. It accepts one RFC 6902 operation or an operation array.

```ts
doc.patch({ op: "replace", path: "/title", value: "Ready" });
doc.patch([
  { op: "add", path: "/items/-", value: item },
  { op: "replace", path: "/meta/owner", value: "core" },
]);
```

`commit` applies patch operations and records an explicit final selection in the same history entry.

```ts
const planned = doc.selection?.textPatch("A");
if (planned?.ok) {
  doc.commit(planned.patch, {
    label: "typing",
    origin: "keyboard",
    mergeKey: "title",
    selection: planned.selection,
  });
}
```

`duplicate` is the public high-level sibling duplication verb. Use it instead of
reaching into internal verb modules when the caller wants duplicate semantics
such as array "after source", object `newKey`, or `rekey`.

```ts
const duplicated = doc.duplicate("/items/0", {
  rekey: { fields: ["id", "slug"], strategy: "suffix" },
});
```

`duplicate` mutates immediately. On success, `value` is the current document value and `applied` is the patch record already applied by the document. Do not pass `applied` to `commit` again.

`load` replaces the document with a schema-valid value. `reset` restores the initial value unless a value is provided. `subscribe` observes applied patch records and serializable metadata.

## 5. Read And Query

Reads do not mutate.

```ts
doc.at("/items/0/name");
doc.exists("/items/0");
doc.entries("/items");
doc.query("$.items[*].id");
```

JSONPath result pointers can be fed back into `patch`.

```ts
const found = doc.query("$.items[?(@.done==false)]");
if (found.ok) {
  doc.patch(found.pointers.map((path) => ({ op: "replace", path: `${path}/done`, value: true })));
}
```

JSONPath is a search language in this package. Mutation inputs remain JSON
Patch operations with JSON Pointer `path` and `from` fields.

## 6. Selection

Selection is JSON-safe state, not a command namespace. It answers "what is selected" and provides selection planning helpers.

Core vocabulary:

- `anchor`
- `focus`
- `selectionRanges`
- `selectedPointers`
- `primaryIndex`
- caret as a collapsed range

Common operations:

```ts
doc.selection?.collapse("/items/0");
doc.selection?.selectRanges(["/items/0", "/items/1"]);
doc.selection?.moveCursor("next", { points });
doc.selection?.extendCursor("next", { points });
doc.selection?.textPatch("replacement");
doc.selection?.deleteText();
doc.selection?.snapshot();
doc.selection?.restore(snapshot);
```

Document patches automatically track selection pointers when possible. Lost selections recover to nearby siblings or parent positions.

## 7. Clipboard

Clipboard owns JSON payload flow. It is a headless buffer and never calls `navigator.clipboard`.

```ts
doc.clipboard.copy("/items/0");
doc.clipboard.cut(["/items/0", "/items/1"]);
doc.clipboard.paste("/items/-");
doc.clipboard.paste({ after: "/items/0" });
doc.clipboard.pastePayload("/items/-", { id: "new", name: "New" });
doc.clipboard.clear();
```

`copy` and `cut` may omit `source`; then the current selection source is used. `paste` may omit `target`; then the current primary selection pointer is used. Direct payload paste uses `pastePayload` and does not require writing to the buffer first.

`cut`, `paste`, and `pastePayload` mutate immediately. On success, `value` is the current document value and `applied` is the patch record already applied by the document.

Use a pointer such as `/items/-` when the caller already has an insertion position. Use `{ before: pointer }`, `{ after: pointer }`, or `{ replace: pointer }` when the target is an existing value.

Multi-source copy/cut stores an array payload. Pasting a multi-source buffer into an array target spreads by default. `{ spread: false }` keeps the array as one payload value.

## 8. History

History stores forward and inverse patch records with selection metadata.

```ts
doc.history.undo();
doc.history.redo();
doc.history.mergeLast({ mergeKey: "typing:title" });
doc.history.transaction({ label: "rename" }, () => {
  doc.patch({ op: "replace", path: "/items/0/name", value: "A" });
  doc.patch({ op: "replace", path: "/items/1/name", value: "B" });
});
```

`history.canUndo` and `history.canRedo` are booleans for UI disabled states. `canUndo()` and `canRedo()` return reasoned capability results.

## 9. Schema

Every mutation is validated against the provided Zod schema. Failed mutations are atomic: state, selection, clipboard, and history are not partially updated.

```ts
doc.schema.kind("/items/-", "insert");
doc.schema.describe("/items/-", "insert");
doc.schema.accepts("/items/-", candidate, "insert");
```

## 10. Testing Contract

Public behavior tests must enter through root exports and the `JSONDocument` surface. Tests should not assert private source structure. Internal modules may exist for implementation cohesion, but they are not the external contract.

Required verification before release:

- `npm run typecheck -w zod-crud`
- `npm test -w zod-crud`
- `npm run build -w zod-crud`
- `npm run smoke:package -w zod-crud`
- `npm run docs:evaluate`
- `npm run verify`
- `npm run playground:typecheck`
- `npm run playground:test`
- `npm run build -w @zod-crud/site`
