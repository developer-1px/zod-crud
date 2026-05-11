# zod-crud

zod-crud is a JSON tree library that maps the **edit vocabulary every FE
service rebuilds from scratch** (select, move, cut, copy, paste, duplicate,
undo, redo, find, replace) onto JSON standards (**RFC 6901 Pointer · RFC
6902 Patch · RFC 9535 JSONPath · W3C Selection · RFC 8927 + Zod**) so the
vocabulary becomes a **reusable standard layer**.

State, actions, and change records are 100% serializable JSON. The core is
pure RFC substrate. `verbs/*` compose substrate into the 10 edit verbs.
`hooks/useJsonDocument` is a thin React adapter that injects selection.
`sidecars/` hold cross-cutting concerns (recorder, debug log, http).

The behavior contract lives in [`SPEC.md`](./SPEC.md). It is the single
source of truth and outranks code, docs, and tests on conflict. The
RFC ↔ `core/*` 1:1 mapping is in [`STANDARDS.md`](./STANDARDS.md).

## Install

```sh
npm install zod-crud zod
```

`zod` is a peer dependency. `react >=18` is an optional peer dependency
required only for React hooks. The package is ESM-only.

## React — `useJsonDocument`

```tsx
import * as z from "zod";
import { useJsonDocument } from "zod-crud";

const Schema = z.object({
  title: z.string(),
  tasks: z.array(z.object({ id: z.string(), done: z.boolean() })),
});

export function App() {
  const doc = useJsonDocument(Schema, { title: "", tasks: [] }, { history: 50 });

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

`useJsonDocument` returns a single facade with five surfaces:

| Surface | Purpose |
| --- | --- |
| `doc.value` | current schema-valid state (`T`) |
| `doc.ops` | RFC 6902 escape hatch — `add`/`remove`/`replace`/`move`/`copy`/`test`/`patch` |
| `doc.commands` | 10 edit verbs (select/find/move/duplicate/replace/cut/copy/paste/undo/redo) |
| `doc.can` | mutation guard predicates + `undo`/`redo` flags |
| `doc.selection` | W3C-shaped selection coordinates (anchor/focus, JSON Pointer) |
| `doc.history` | `canUndo`/`canRedo`/`mergeLast` flags |

Selection and history are first-class — they are not parallel hooks you wire
up yourself. `commands.*` mutate through the history-aware path; `ops.*` is
the low-level RFC 6902 escape hatch for fire-and-forget patches.

For lower-level composition (`useJson` + `useSelection`), see the
[Lower-level Hooks](../../docs/site/examples.md) guide.

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
import { serialize, parse, safeParse } from "zod-crud";

const json = serialize(state);                // string
const restored = parse(Schema, json);         // throws on schema mismatch
const safe = safeParse(Schema, json);         // returns { ok, ... }
```

Operations are also pure JSON, so they can be sent over the wire and
applied on the server with any RFC 6902 implementation:

```ts
fetch("/api/save", {
  method: "PATCH",
  headers: { "Content-Type": "application/json-patch+json" },
  body: JSON.stringify(operations),
});
```

## API

See [`SPEC.md`](./SPEC.md) §5 for the canonical surface. Briefly:

| Export | Purpose |
| --- | --- |
| `useJsonDocument(schema, initial, options?)` | React facade (SPEC §5.10) |
| `JsonDocument<T>`, `JsonDocumentHistory`, `UseJsonDocumentOptions<T>` | facade types (SPEC §5.10) |
| `useJson(schema, initial, options?)` | lower-level hook (SPEC §5.1) |
| `JsonOps<T>` | low-level ops contract (SPEC §5.2) |
| `useSelection(ops, options?)` | lower-level selection hook (SPEC §5.7) |
| `trackPointer`, `trackPointers` | low-level pointer tracking helpers (SPEC §5.9) |
| `applyOperation(schema, state, op)` | pure single-op (SPEC §5.3) |
| `applyPatch(schema, state, ops)` | pure batch (SPEC §5.3) |
| `JsonPatchOperation`, `JsonResult`, `ErrorCode`, `ApplyResult` | RFC 6902 types (SPEC §3, §5.3) |
| `Pointer`, `PointerOf<T>`, `ValueAt<T,P>` | path types (SPEC §2, §5.4) |
| `parsePointer`, `buildPointer`, `escapeSegment`, `unescapeSegment` | RFC 6901 helpers (SPEC §5.6) |
| `serialize`, `parse`, `safeParse` | JSON helpers (SPEC §5.5) |
| `JsonCrudError`, `PointerSyntaxError` | error classes (SPEC §6.3) |

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
