# @interactive-os/json-document-batch-update

Lab batch-update extension for `@interactive-os/json-document` documents.

Use it to set one field (or whole item) across a list of selected item pointers
to a constant or computed value, using only the public document facade.

```ts
import { createBatchUpdate } from "@interactive-os/json-document-batch-update";

const b = createBatchUpdate(doc);

// Set status on the selected rows.
b.batchUpdate(["/rows/0", "/rows/3", "/rows/4"], { value: "done" }, { field: "/status" });

// Compute per target.
b.batchUpdate(selected, { compute: (current) => Number(current) + 1 }, { field: "/n" });
```

## Scope

- Write a `field` sub-pointer (or the whole item) on every target pointer to a
  constant `{ value }` or a host `{ compute }` per-target value.
- Atomic: the whole batch is preflighted with `doc.canPatch`; a single schema
  violation rejects all of it.
- Report `count`, `changed`, planned operations, and `selectionAfter`.
- Expose `canBatchUpdate` beside `batchUpdate`.

## Non-goals

- Selecting which items to edit — the host passes the target pointers (e.g. from
  a multi-select).
- Query-driven replacement across matches — that is `@interactive-os/json-document-bulk-edit`.
- No plugin registration; no `@interactive-os/json-document` internal imports.

## Friction report

The public facade is enough: one `replace` per target preflighted as one
`doc.canPatch` batch, then applied with `doc.patch` (atomic).

This is distinct from `@interactive-os/json-document-bulk-edit`, which replaces positions matched by a
JSONPath query. batch-update is **selection-driven**: it takes the explicit pointer
list a multi-select produces ("set status on these 5 rows"), which a JSONPath
cannot express when the selection is arbitrary. The two are complementary —
query-driven vs selection-driven batch editing.
