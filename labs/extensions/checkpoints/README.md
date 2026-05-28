# @zod-crud/checkpoints

Lab checkpoint extension for `zod-crud` documents.

Use it to test whether named restore points can stay outside core history while
using the public document facade.

```ts
import { createCheckpoints } from "@zod-crud/checkpoints";

const checkpoints = createCheckpoints(doc);

checkpoints.save("before-import", { label: "Before import" });
checkpoints.restore("before-import");
```

## Scope

- Save named JSON snapshots from `doc.value`.
- List, read, remove, and clear snapshots.
- Preflight restore through `doc.canPatch`.
- Restore through `doc.load`.
- Notify subscribers when the checkpoint set changes.

## Non-goals

- No undo/redo history inspection.
- No version graph, branching UI, diff viewer, persistence, cloud sync, CRDT, or
  merge policy.
- No storage host; compose with persistence separately.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Friction report

The public facade is enough for named restore points: the extension snapshots
`doc.value`, validates restore with a root replace `canPatch`, then restores
through `doc.load`.

This keeps checkpoint UX separate from core undo/redo. Product labels, storage,
branching, compare views, and retention policy stay outside core.
