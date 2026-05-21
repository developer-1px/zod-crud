# zod-crud

Headless JSON editing primitives guarded by Zod schemas.

The public model is small:

```txt
document
├─ patch(patch)              RFC 6902 JSON Patch
├─ duplicate(pointer, opts)   sibling duplicate with optional rekey
├─ at(pointer)               RFC 6901 JSON Pointer
├─ query(jsonPath)           RFC 9535 JSONPath
├─ selection                 explicit JSON selection snapshots
├─ clipboard                 copy/cut/paste payload flow
├─ history                   undo/redo patch history
└─ can*                      reasoned capability checks
```

## Install

```sh
npm install zod-crud zod
```

`zod` is a peer dependency. `react >=18` is optional and only needed for
`zod-crud/react`.

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
        onChange={(e) =>
          doc.patch({ op: "replace", path: "/title", value: e.target.value })
        }
      />
      <button
        onClick={() =>
          doc.patch({
            op: "add",
            path: "/tasks/-",
            value: { id: crypto.randomUUID(), done: false },
          })
        }
      >
        add task
      </button>
      <button onClick={() => doc.history.undo()} disabled={!doc.canUndo().ok}>
        undo
      </button>
      {doc.value.tasks.map((task, index) => (
        <label key={task.id}>
          <input
            type="checkbox"
            checked={task.done}
            onChange={(e) =>
              doc.patch({
                op: "replace",
                path: `/tasks/${index}/done`,
                value: e.target.checked,
              })
            }
          />
          {task.id}
        </label>
      ))}
    </>
  );
}
```

## Document Facade

`createJSONDocument` and `useJSONDocument` expose the same document facade.

| Surface | Purpose |
| --- | --- |
| `doc.value` | current schema-valid JSON value |
| `doc.patch(patch)` | apply one JSON Patch operation or an operation array |
| `doc.duplicate(pointer, opts)` | duplicate one sibling and optionally rekey unique fields |
| `doc.load(value)` | replace the document with a schema-valid value |
| `doc.reset()` | restore the initial value or a provided value |
| `doc.subscribe(listener)` | observe applied patch records |
| `doc.at(pointer)` | read one JSON Pointer location |
| `doc.exists(pointer)` | check whether a pointer resolves |
| `doc.query(jsonPath)` | return pointer matches for a JSONPath query |
| `doc.entries(pointer)` | list object/array child entries |
| `doc.selection` | optional headless selection state |
| `doc.clipboard` | headless clipboard payload buffer |
| `doc.history` | undo/redo state and controls |
| `doc.can*` | reasoned capability checks, not booleans |
| `doc.schema` | schema introspection for a pointer |

## Patch, Pointer, JSONPath

```ts
doc.patch({ op: "replace", path: "/title", value: "Ready" });
doc.patch([
  { op: "replace", path: "/settings/owner", value: "playground" },
  { op: "add", path: "/lists/0/cards/-", value: card },
]);

doc.at("/lists/0/cards/0/title");
doc.query("$..cards[?(@.status=='todo')]");
```

Patch paths are JSON Pointers. JSONPath is only for query; use the returned
pointers when you want to patch.

Use `duplicate` when the intent is sibling duplication rather than a raw RFC
`copy` operation. Arrays insert the duplicate after the source. Object members
need `newKey`. `rekey` can mint new values for id-like fields.

```ts
const duplicated = doc.duplicate("/lists/0/cards/0", {
  rekey: { fields: ["id", "slug"], strategy: "suffix" },
});

if (duplicated.ok) {
  duplicated.value; // current document value after mutation
  duplicated.applied; // already-applied patch records
}
```

`duplicate`, `clipboard.cut`, `clipboard.paste`, and `clipboard.pastePayload`
mutate the document immediately. Their `applied` records are for inspection;
do not pass them to `commit` again.

## Selection

Selection is a JSON-safe value. Use `anchor`/`focus` to preserve direction and
`selectionRanges` for multi-select.

```ts
doc.selection?.selectRanges([
  "/lists/0/cards/0",
  "/lists/0/cards/1",
]);

const selection = doc.selection?.snapshot();
```

For object members, prefer explicit pointer lists. JSON objects are unordered
by the JSON RFC, so object child ranges should not carry ordering semantics.

## Clipboard

Clipboard operations should receive explicit sources and targets.

```ts
const source = doc.selection?.selectedPointers ?? [];
const copied = doc.clipboard.copy(source);

if (copied.ok) {
  const pasted = doc.clipboard.paste("/lists/1/cards/-");
  if (pasted.ok) pasted.applied;
}
```

For direct payload insertion, pass the payload explicitly.

```ts
doc.clipboard.pastePayload("/lists/0/cards/-", { id: "new", title: "New card" });
doc.clipboard.paste("/lists/0/cards/0", { mode: "after" });
```

For `before` and `after`, `target` is an existing item pointer. If you already
have an insertion pointer such as `/cards/-`, use the default paste mode or
`patch({ op: "add" })`.

## History

Document changes are recorded as patch/inverse-patch entries. Undo/redo lives
under `doc.history`.

```ts
doc.patch({ op: "replace", path: "/title", value: "Final" });
doc.history.undo();
doc.history.redo();
```

Group synchronous edits with `transaction`.

```ts
doc.history.transaction({ label: "rename cards" }, () => {
  doc.patch({ op: "replace", path: "/lists/0/cards/0/title", value: "A" });
  doc.patch({ op: "replace", path: "/lists/0/cards/1/title", value: "B" });
});
```

## Capability Checks

`can*` methods return a result object so UI and tests can inspect the reason.
`canPaste` checks the current clipboard buffer. `canPastePayload` checks a
direct payload.

```ts
const result = doc.canPastePayload("/lists/0/cards/-", candidateCard);

if (!result.ok) {
  console.log(result.code, result.reason);
}
```

Available checks include `canPatch`, `canReplace`, `canRemove`, `canMove`,
`canDuplicate`, `canCopy`, `canCut`, `canPaste`, `canPastePayload`, `canUndo`,
and `canRedo`.

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
  console.log(r.state);
}
```

Both `applyOperation` and `applyPatch` are pure. Same input, same output.

## Serialization

State, operations, selection snapshots, and patch records are JSON.

```ts
import * as z from "zod";

const Schema = z.object({ title: z.string() });
const state = { title: "draft" };

const json = JSON.stringify(state);
const restored = Schema.parse(JSON.parse(json));
const safe = Schema.safeParse(JSON.parse(json));
```

Operations can be sent as `application/json-patch+json`.

```ts
const operations = [{ op: "replace", path: "/title", value: "final" }];

fetch("/api/save", {
  method: "PATCH",
  headers: { "Content-Type": "application/json-patch+json" },
  body: JSON.stringify(operations),
});
```

## Public Exports

Root entrypoint:

```ts
import {
  createJSONDocument,
  applyOperation,
  applyPatch,
  parsePointer,
  tryParsePointer,
  buildPointer,
  trackPointer,
  type JSONDocument,
  type JSONDocumentDuplicateOptions,
  type JSONDocumentDuplicateResult,
  type JSONDocumentHistory,
  type JSONDocumentMutationOk,
  type JSONDocumentPasteMode,
  type JSONDocumentPasteOptions,
  type JSONChangeMetadata,
  type HistoryTransactionOptions,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
  type SelectionSnap,
} from "zod-crud";
```

React entrypoint:

```ts
import { useJSONDocument } from "zod-crud/react";
```
