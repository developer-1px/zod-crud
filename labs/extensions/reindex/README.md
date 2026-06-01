# @zod-crud/reindex

Lab reindex extension for `zod-crud` documents.

Use it to sync an order/position field to each item's array position (persisting
a drag reorder), using only the public document facade.

```ts
import { createReindex } from "@zod-crud/reindex";

const r = createReindex(doc);

r.reindex("/cards");                                  // order = 0,1,2,...
r.reindex("/cards", { field: "/position", step: 10 }); // 0,10,20,...
```

## Scope

- Write a sequential value (`start + index * step`) into a `field` (default
  `"/order"`) on each array item, matching its current position.
- Emit operations only for items whose value actually changes; report
  `changedCount`. Preflight with `doc.canPatch`.
- Expose `canReindex` beside `reindex`.

## Non-goals

- Reordering the array itself — run a reorder (`@zod-crud/collection`,
  `move-selection`, `swap`) first, then reindex to persist the new order.
- Fractional/gap indexing strategies (LexoRank-style) — host-owned.
- No plugin registration; no `zod-crud` internal imports.

## Friction report

The public facade is enough: read the array, write `position-as-order` per item
where it differs, preflight as one `doc.canPatch` batch, apply. Distinct from
`fill-series` (which fills a contiguous *range* with a series): reindex syncs a
field across the *whole* array to its position, the persist step after a manual
drag reorder. Gap/fractional indexing for conflict-free inserts stays host-owned.
