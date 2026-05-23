# zod-crud

Headless JSON editing primitives guarded by Zod schemas.

Official site and demos: https://developer-1px.github.io/zod-crud/

## 왜 zod-crud인가

프론트엔드 편집 기능은 대부분 JSON state를 바꾸는 일입니다. zod-crud는 patch, pointer, selection, clipboard, history, schema validation을 UI 코드에서 분리해 headless document facade로 묶습니다.

공식 문서는 배경, core concept, 작은 카드 편집기 튜토리얼을 먼저 설명한 뒤 API reference로 이어집니다.

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

## Source Layout

Public entrypoints are intentionally at the package source root:

```txt
src/
├─ index.ts      zod-crud
├─ react.ts      zod-crud/react
├─ application/  document facade assembly
├─ domain/       editing, selection, schema, tracking rules
└─ foundation/   JSON Patch, JSON Pointer, JSONPath, history, errors
```

In source references, write these entrypoints as `src/index.ts` and
`src/react.ts`.

Only `zod-crud` and `zod-crud/react` are package API. Do not import
`zod-crud/src/*`, `zod-crud/dist/*`, `application/*`, `domain/*`, or
`foundation/*` subpaths.

## Task Entrypoints

| Task | API |
| --- | --- |
| Add, update, remove, or move JSON values | `doc.patch(...)` |
| Duplicate a sibling | `doc.duplicate(pointer, options)` |
| Find multiple locations | `doc.query(jsonPath)`, then patch returned pointers |
| Copy or cut a multi-selection | pass `doc.selection?.selectedPointers` to `doc.clipboard.copy/cut` |
| Paste external payload | `doc.clipboard.pastePayload(target, payload, options)` |
| Validate before applying | `doc.can*` |
| Undo or redo | check `doc.canUndo()` / `doc.canRedo()`, then call `doc.history` |

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
| `doc.at(pointer)` | read one JSON Pointer location as a `ReadResult` |
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

`doc.at(pointer)` returns a result object, not the raw value.

```ts
const result = doc.at("/lists/0/cards/0/title");
if (result.ok) {
  result.value;
}
```

`doc.patch(...)` accepts one operation or an operation array. `doc.commit(...)`
and `doc.canPatch(...)` take operation arrays because they plan or record a
batch.

```ts
doc.patch({ op: "replace", path: "/title", value: "Ready" });
doc.canPatch([{ op: "replace", path: "/title", value: "Ready" }]);
doc.commit([{ op: "replace", path: "/title", value: "Ready" }], { label: "rename" });
```

Use JSONPath to find values, not to mutate them directly.

```ts
doc.query("$..cards[?(@.status=='todo')]");
doc.query("$.lists[*].cards[*]");
```

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

Common selection surface:

| Need | API |
| --- | --- |
| Read current selection | `selectedPointers`, `primaryPointer`, `anchorPointer`, `focusPointer`, `caret` |
| Collapse or extend | `collapse(point)`, `setBaseAndExtent(anchor, focus)`, `extend(point)` |
| Multi-select | `addRange(range)`, `removeRange(range)`, `togglePointer(pointer)`, `selectRanges(ranges)` |
| Cursor movement | `moveCursor(direction)`, `extendCursor(direction)`, `resolveCursor(direction)` |
| Text editing plans | `textPatch(replacement)`, `deleteText(options)` |
| Serialization | `snapshot()`, `toJSON()`, `restore(snapshot)`, `subscribe(listener)` |

For object members, prefer explicit pointer lists. JSON objects are unordered
by the JSON RFC, so object child ranges should not carry ordering semantics.

Use selected pointers as clipboard sources when the user has made a multi-select.

```ts
const source = doc.selection?.selectedPointers ?? [];
doc.clipboard.copy(source);
doc.clipboard.cut(source);
```

`copy()` and `cut()` can fall back to the current selection when the source is
omitted, but explicit sources are easier to audit in app code and tests.

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
doc.clipboard.paste({ after: "/lists/0/cards/0" });
```

For large payloads that are already JSON-compatible, buffer them without
revalidating the JSON boundary.

```ts
doc.clipboard.write(cards, { trustedPayload: true });
```

When the caller also owns the payload's immutability boundary, skip the
clipboard buffer clone as well.

```ts
doc.clipboard.write(cards, { trustedPayload: true, clonePayload: false });
const read = doc.clipboard.read({ clonePayload: false });
```

Use a pointer such as `/cards/-` when you already have an insertion position.
Use `{ before: pointer }`, `{ after: pointer }`, or `{ replace: pointer }` when
the target is an existing value.

Pointer-array copy stores an array payload. When the paste should insert each
copied item as a separate sibling, pass `spread: true`. This matters even when
the pointer array has one item.

```ts
doc.clipboard.copy(["/lists/0/cards/0"]);
doc.clipboard.paste("/lists/1/cards/-", {
  spread: true,
  rekey: { fields: ["id"], strategy: "suffix" },
});
```

Use the same paste options in `canPaste(...)` that you will use in
`paste(...)`.

```ts
const target = "/lists/1/cards/-";
const options = { spread: true, rekey: { fields: ["id"], strategy: "suffix" } } as const;
if (doc.canPaste(target, options).ok) doc.clipboard.paste(target, options);
```

## Tree Editing Cookbook

Tree semantics belong to the app. zod-crud stores and validates JSON; the app
turns UI actions such as indent, outdent, visible-row focus, and toolbar
commands into JSON Pointers and JSON Patch operations.

```ts
type Node = { id: string; text: string; children: Node[] };

const NodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.object({
    id: z.string(),
    text: z.string(),
    children: z.array(NodeSchema),
  }),
);

const OutlineSchema = z.object({ nodes: z.array(NodeSchema) });
```

Useful tree pointers look like this:

```txt
/nodes/0
/nodes/0/children/0
/nodes/0/children/0/children/0
```

Common tree actions are plain patch operations:

```ts
// Add child.
doc.patch({ op: "add", path: "/nodes/0/children/-", value: node });

// Add sibling after /nodes/0.
doc.patch({ op: "add", path: "/nodes/1", value: node });

// Move up or down within the same array.
doc.patch({ op: "move", from: "/nodes/1", path: "/nodes/0" }); // up
doc.patch({ op: "move", from: "/nodes/0", path: "/nodes/1" }); // down one

// Indent under previous sibling.
doc.patch({ op: "move", from: "/nodes/1", path: "/nodes/0/children/-" });

// Outdent to the parent's next sibling slot.
doc.patch({ op: "move", from: "/nodes/0/children/1", path: "/nodes/1" });
```

For same-array moves, RFC 6902 removes the source first and then adds at the
destination path. To move `/nodes/0` down one row, use `/nodes/1`, not
`/nodes/2`.

Selection is still headless JSON state. Pair it with DOM focus or local UI state
when the product needs visible-row focus.

```ts
doc.selection?.selectRanges(["/nodes/0"]);
const selected = doc.selection?.primaryPointer;
```

## History

Document changes are recorded as patch/inverse-patch entries. Undo/redo lives
under `doc.history`.

```ts
doc.patch({ op: "replace", path: "/title", value: "Final" });
doc.history.undo();
doc.history.redo();
```

For many known edits, build one operation array and commit it once. This keeps
schema validation, history recording, and subscribers on one document change.

```ts
doc.commit([
  { op: "replace", path: "/lists/0/cards/0/title", value: "A" },
  { op: "replace", path: "/lists/0/cards/1/title", value: "B" },
], { label: "rename cards" });
```

History metadata is serializable and follows the patch entry.

```ts
doc.commit(patch, {
  label: "typing",
  origin: "keyboard",
  mergeKey: "title",
  selection: nextSelection,
});

doc.history.mergeLast({ mergeKey: "title" });
```

Use `history.transaction` only when each step must observe the intermediate
document state. It groups history entries, but it does not turn repeated
`doc.patch(...)` calls into one schema validation pass.

## Performance

For large documents, keep hot UI paths on the document facade: `doc.patch`,
`doc.commit`, and `doc.canPatch`. Public `applyPatch` is an external JSON
boundary and checks the whole input state for JSON safety. If the state already
crossed that boundary, `applyPatchToTrustedState` skips the state scan and can
use the same trusted plain-schema fast paths as the document facade.

Fast document paths apply when the current state is trusted document state and
the schema is a plain structural Zod schema: objects, arrays, records, and
scalar validators without refinements, transforms, or checks. Covered edits are
independent non-root `replace`, array `add`/`remove`/`copy`/`move`, and
same-array `add`/`remove` batches. Schemas with `refine`, `superRefine`,
transforms, or other checks intentionally use full root schema validation.

Measure core workloads locally with:

```sh
npm run perf:core
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

Schema failures expose `violations` for UI messages.

```ts
const blocked = doc.canPastePayload("/lists/0/cards/-", invalidCard);

if (!blocked.ok && blocked.code === "schema_violation") {
  blocked.violations?.map((violation) => [violation.path, violation.message]);
}
```

Available checks include `canPatch`, `canFind`, `canReplace`, `canRemove`,
`canMove`, `canDuplicate`, `canCopy`, `canCut`, `canPaste`,
`canPastePayload`, `canUndo`, and `canRedo`.

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
Use `applyPatchToTrustedState` only when the caller already owns the JSON
boundary for the input state; operation values and schema are still checked.

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

## Verification

Before release, run the root gate. It includes package checks and
`docs:evaluate`, which guards this README, the site API doc, SPEC, `llms.txt`,
release notes, the source-layout SSOT, and the 100-loop ledger.

```sh
npm run verify
```

## Public Exports

Root entrypoint:

```ts
import {
  JSONCrudError,
  createJSONDocument,
  applyOperation,
  applyPatch,
  applyPatchToTrustedState,
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
  type JSONDocumentCommitOptions,
  type JSONDocumentDuplicateOptions,
  type JSONDocumentDuplicateResult,
  type JSONDocumentHistory,
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
