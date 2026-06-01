# @zod-crud/dedupe

Lab dedupe extension for `zod-crud` documents.

Use it to test whether removing duplicate array items can stay outside core
while using only the public document facade.

```ts
import { createDedupe } from "@zod-crud/dedupe";

const d = createDedupe(doc);

// Whole-value duplicates.
d.dedupe("/tags");

// Objects deduped by a host-chosen key, keeping the first occurrence.
d.dedupe("/rows", { keyOf: (row) => row.id });
```

## Scope

- Remove duplicate items from a JSON array, keeping the first occurrence in
  order.
- Equality key is host policy via `options.keyOf`; the default is whole-value
  JSON equality.
- Return planned operations, removed count, and the original removed indices
  before mutating.
- Expose `canDedupe` beside `dedupe`.

## Non-goals

- Deciding what counts as a duplicate — host owns `keyOf`.
- Fuzzy/approximate matching, cross-array dedupe, or rendered table UI.
- No stable identity tracking; host code owns id-to-pointer policy when needed.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Friction report

The public facade is enough: read the array with `doc.at`, build the deduped
array (first occurrence per key), preflight with `doc.canPatch`, then apply with
`doc.patch`. Same shape as `@zod-crud/collection-sort` — an array-level command
parameterized by a host function, applied as one schema-safe array replacement.

This is distinct from `@zod-crud/bulk-edit` (which deletes positions matched by a
JSONPath): dedupe needs pairwise key comparison across the array to find later
duplicates, which a JSONPath match cannot express.

The tradeoff is patch granularity: replacing the whole array is compact and
schema-safe but loses per-item Pointer continuity; hosts that need it should pair
this with stable ids.
