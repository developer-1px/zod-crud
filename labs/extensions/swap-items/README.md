# @zod-crud/swap-items

Lab swap-items extension for `zod-crud` documents.

Use it to exchange the positions of two items in the same JSON array, using only
the public document facade.

```ts
import { createSwapItems } from "@zod-crud/swap-items";

const s = createSwapItems(doc);

s.swapItems("/items/0", "/items/2"); // exchange positions 0 and 2
```

## Scope

- Exchange two array items that share a parent array.
- Swapping an item with itself, or two equal values, is a no-op.
- Preflight with `doc.canPatch`; return the parent `path` and planned operations.
- Expose `canSwapItems` beside `swapItems`.

## Non-goals

- Cross-array swaps, or moving an item to an arbitrary index (use
  `@zod-crud/move-selected` / `@zod-crud/collection`).
- No plugin registration; no `zod-crud` internal imports.

## Friction report

Worth noting why this is its own capability rather than two core `move`s: a pair
of `move` operations shifts intermediate indices, so naively moving A→B then B→A
does not exchange them. `swapItems` computes the exchanged array directly and applies it
as one schema-safe `replace`, which is both correct and atomic. Common in gallery
reordering, A/B arrangement, and "swap rows" actions.
