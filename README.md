# zod-crud

A Zod-guarded JSON tree library locked to **RFC 6901 (JSON Pointer)** and
**RFC 6902 (JSON Patch)**. State, actions, and change records are 100%
serializable JSON. The core is pure functions; React hooks live behind the
`zod-crud/react` entrypoint.

The behavior contract lives in `packages/zod-crud/SPEC.md`. It describes the
current package behavior; on conflict, code behavior wins unless it conflicts
with an RFC, in which case the RFC wins.

## Package

The publishable package lives in `packages/zod-crud`.

```sh
npm install zod-crud zod
```

### React

```tsx
import * as z from "zod";
import { useJSONDocument } from "zod-crud/react";

const Schema = z.object({
  title: z.string(),
  tasks: z.array(z.object({ id: z.string(), done: z.boolean() })),
});

function App() {
  const doc = useJSONDocument(Schema, { title: "", tasks: [] });

  return (
    <>
      <input
        value={doc.value.title}
        onChange={(e) => doc.ops.replace("/title", e.target.value)}
      />
      <button
        onClick={() => doc.ops.add("/tasks/-", { id: crypto.randomUUID(), done: false })}
      >
        add task
      </button>
    </>
  );
}
```

### Dict-record 한 키 쓰기

`z.record` 의 키 하나를 변경할 때는 path 를 직접 가리킵니다. 전체 dict 를 spread 해 replace 하면 history entry 가 dict 전체 교체로 기록됩니다.

```ts
if (v === '' && cells[k] !== undefined) ops.remove(`/cells/${k}`);
else if (v !== '' && cells[k] === undefined) ops.add(`/cells/${k}`, v);
else if (v !== '' && cells[k] !== v) ops.replace(`/cells/${k}`, v);
```

### Drag / keystroke burst — undo entry 합치기

burst 입력으로 history 가 폭증하면 `doc.history.mergeLast()` 로 직전 두 entry 를 합치거나, drag/IME 같이 transient 한 입력은 local state 로 미리보기 후 drop/commit 시점에 한 번만 `ops` 호출합니다. 시나리오별 예제는 `docs/site/operations.md` 참조.

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
- `packages/zod-crud/src/index.ts` and `packages/zod-crud/src/react.ts` are the public export surfaces (SPEC §5).
- `CONTRIBUTING.md` describes the change rules and verification checklist.
