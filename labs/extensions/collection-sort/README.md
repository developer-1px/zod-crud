# @zod-crud/collection-sort

Lab collection sort extension for `zod-crud` documents.

Use it to test whether ordered JSON array sorting can stay outside core while
still using only the public document facade.

```ts
import { createCollectionSort } from "@zod-crud/collection-sort";

const sorter = createCollectionSort(doc);

sorter.sort("/cards", (left, right) =>
  left.value.title.localeCompare(right.value.title),
);
sorter.reverse("/slides");
```

## Scope

- Sort a JSON array at a Pointer with a host-owned comparator.
- Reverse a JSON array at a Pointer.
- Return planned replacement operations before mutating.
- Expose `can*` methods beside every edit method.

## Non-goals

- No rendered table, kanban, spreadsheet, or outline UI.
- No filter panel, sort menu, column model, keyboard policy, or focus policy.
- No stable identity tracking; host code owns id-to-pointer policy when needed.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Friction report

The public facade is enough for value-correct sort/reverse: read the array with
`doc.at`, build a replacement array, preflight with `doc.canPatch`, then apply
with `doc.patch`.

The tradeoff is patch granularity. Replacing the whole array is compact and
schema-safe, but hosts that need per-item Pointer continuity after sort should
pair this with stable ids or Pointer tracking rather than asking core to own a
sort command.
