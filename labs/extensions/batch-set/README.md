# @zod-crud/batch-set

Lab batch-set extension for `zod-crud` documents.

Use it to set one field (or whole item) across a list of selected item pointers
to a constant or computed value, using only the public document facade.

```ts
import { createBatchSet } from "@zod-crud/batch-set";

const b = createBatchSet(doc);

// Set status on the selected rows.
b.batchSet(["/rows/0", "/rows/3", "/rows/4"], { value: "done" }, { field: "/status" });

// Compute per target.
b.batchSet(selected, { compute: (current) => Number(current) + 1 }, { field: "/n" });
```

## Scope

- Write a `field` sub-pointer (or the whole item) on every target pointer to a
  constant `{ value }` or a host `{ compute }` per-target value.
- Atomic: the whole batch is preflighted with `doc.canPatch`; a single schema
  violation rejects all of it.
- Report `count`, `changed`, planned operations, and `selectionAfter`.
- Expose `canBatchSet` beside `batchSet`.

## Non-goals

- Selecting which items to edit — the host passes the target pointers (e.g. from
  a multi-select).
- Query-driven replacement across matches — that is `@zod-crud/bulk-edit`.
- No plugin registration; no `zod-crud` internal imports.

## Friction report

The public facade is enough: one `replace` per target preflighted as one
`doc.canPatch` batch, then applied with `doc.patch` (atomic).

This is distinct from `@zod-crud/bulk-edit`, which replaces positions matched by a
JSONPath query. batch-set is **selection-driven**: it takes the explicit pointer
list a multi-select produces ("set status on these 5 rows"), which a JSONPath
cannot express when the selection is arbitrary. The two are complementary —
query-driven vs selection-driven batch editing.
