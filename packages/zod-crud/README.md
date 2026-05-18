# zod-crud

zod-crud is a JSON tree library that maps the **edit vocabulary every FE
service rebuilds from scratch** (select, move, cut, copy, paste, duplicate,
undo, redo, find, replace) onto JSON standards (**RFC 6901 Pointer · RFC
6902 Patch · RFC 9535 JSONPath · W3C Selection · RFC 8927 + Zod**) so the
vocabulary becomes a **reusable standard layer**.

State, actions, and change records are 100% serializable JSON. The core is
pure RFC substrate. `verbs/*` compose substrate into the 10 edit verbs.
`hooks/useJSONDocument` is a thin React adapter that injects selection.
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
import { useJSONDocument } from "zod-crud";

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

`useJSONDocument` returns a single facade with five surfaces:

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

For lower-level composition (`useJSON` + `useSelection`), see the
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

See [`SPEC.md`](./SPEC.md) §5 for the public surface. Briefly:

| Export | Purpose |
| --- | --- |
| `useJSONDocument(schema, initial, options?)` | React facade (SPEC §5.10) |
| `JSONDocument<T>`, `JSONDocumentHistory`, `UseJSONDocumentOptions<T>` | facade types (SPEC §5.10) |
| `useJSON(schema, initial, options?)` | lower-level hook (SPEC §5.1) |
| `JSONOps<T>` | low-level ops contract (SPEC §5.2) |
| `useSelection(ops, options?)` | lower-level selection hook (SPEC §5.7) |
| `trackPointer` | low-level pointer tracking helper (SPEC §5.8) |
| `applyOperation(schema, state, op)` | pure single-op (SPEC §5.3) |
| `applyPatch(schema, state, ops)` | pure batch (SPEC §5.3) |
| `JSONPatchOperation`, `JSONResult`, `ErrorCode`, `ApplyResult` | RFC 6902 types (SPEC §3, §5.3) |
| `Pointer`, `PointerOf<T>`, `ValueAt<T,P>` | path types (SPEC §2, §5.4) |
| `parsePointer`, `buildPointer`, `escapeSegment`, `unescapeSegment` | RFC 6901 helpers (SPEC §5.6) |
| `serialize`, `parse`, `safeParse` | JSON helpers (SPEC §5.5) |
| `JSONCrudError`, `PointerSyntaxError` | error classes (SPEC §6.3) |

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
