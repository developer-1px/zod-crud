# zod-crud

A Zod-guarded JSON tree library locked to **RFC 6901 (JSON Pointer)** and
**RFC 6902 (JSON Patch)**. State, actions, and change records are 100%
serializable JSON. The core is pure functions; React is confined to one hook.

The contract is `packages/zod-crud/SPEC.md`. It is the single source of truth
and outranks code, docs, and tests on conflict.

## Package

The publishable package lives in `packages/zod-crud`.

```sh
npm install zod-crud zod
```

### React

```tsx
import * as z from "zod";
import { useJson } from "zod-crud";

const Schema = z.object({
  title: z.string(),
  tasks: z.array(z.object({ id: z.string(), done: z.boolean() })),
});

function App() {
  const [json, ops] = useJson(Schema, { title: "", tasks: [] });

  return (
    <>
      <input
        value={json.title}
        onChange={(e) => ops.replace("/title", e.target.value)}
      />
      <button
        onClick={() => ops.add("/tasks/-", { id: crypto.randomUUID(), done: false })}
      >
        add task
      </button>
    </>
  );
}
```

### Pure core (no React)

```ts
import * as z from "zod";
import { applyPatch } from "zod-crud";

const Schema = z.object({ title: z.string() });
const { state, result } = applyPatch(Schema, { title: "draft" }, [
  { op: "replace", path: "/title", value: "final" },
]);
```

## Commands

```sh
npm run typecheck
npm test
npm run build
npm run smoke:package
npm run verify
```

## Maintainer Notes

- `packages/zod-crud/SPEC.md` is the canonical specification.
- `packages/zod-crud/src/index.ts` is the public export surface (SPEC §5).
- `CONTRIBUTING.md` describes the change rules and verification checklist.
