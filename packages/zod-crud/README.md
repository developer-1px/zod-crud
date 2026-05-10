# zod-crud

A Zod-guarded JSON tree library locked to **RFC 6901 (JSON Pointer)** and
**RFC 6902 (JSON Patch)**. State, actions, and change records are 100%
serializable JSON. The core is pure functions; React hooks layer editor
coordinates such as selection and focus on top of that RFC substrate.

The behavior contract lives in [`SPEC.md`](./SPEC.md). It is the single
source of truth and outranks code, docs, and tests on conflict.

## Install

```sh
npm install zod-crud zod
```

`zod` is a peer dependency. `react >=18` is an optional peer dependency
required only for React hooks. The package is ESM-only.

## React — `useJson`

```tsx
import * as z from "zod";
import { useJson } from "zod-crud";

const Schema = z.object({
  title: z.string(),
  tasks: z.array(z.object({ id: z.string(), done: z.boolean() })),
});

export function App() {
  const [json, ops] = useJson(Schema, { title: "", tasks: [] }, { history: 50 });

  return (
    <>
      <input
        value={json.title}
        onChange={(e) => ops.replace("/title", e.target.value)}
      />
      <button
        onClick={() =>
          ops.add("/tasks/-", { id: crypto.randomUUID(), done: false })
        }
      >
        add task
      </button>
      <button onClick={ops.undo} disabled={!ops.canUndo()}>
        undo
      </button>
      {json.tasks.map((t, i) => (
        <div key={t.id}>
          <input
            type="checkbox"
            checked={t.done}
            onChange={(e) =>
              ops.replace(`/tasks/${i}/done` as `/tasks/${number}/done`, e.target.checked)
            }
          />
          <button onClick={() => ops.remove(`/tasks/${i}` as `/tasks/${number}`)}>
            remove
          </button>
        </div>
      ))}
    </>
  );
}
```

Every method on `ops` corresponds 1:1 to an RFC 6902 operation:
`add`, `remove`, `replace`, `move`, `copy`, `test`, plus `patch` for batches.
There is no `set`, `insert`, `delete`, `rename`, or `paste` — the standard
six operations express every mutation.

`ops` also exposes `subscribe(listener)` and a read-only `state` snapshot so
Axis 2 hooks can follow committed RFC 6902 operations.

## React — editor coordinates

`useSelection(ops, options?)` and `useFocus(ops, options?)` provide JSON
Pointer-based editor coordinates. They do not render UI or handle DOM keyboard
events; they track coordinates when RFC 6902 operations are committed through
`useJson`.

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
| `useJson(schema, initial, options?)` | React hook (SPEC §5.1) |
| `JsonOps<T>` | hook return type (SPEC §5.2) |
| `useSelection(ops, options?)` | selection hook (SPEC §5.7) |
| `useFocus(ops, options?)` | focus hook (SPEC §5.8) |
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
