# @zod-crud/move-selection

Lab move-selection extension for `zod-crud` documents.

Use it to test whether moving a contiguous block of selected sibling items to a
new position can stay outside core while using only the public document facade.

```ts
import { createMoveSelection } from "@zod-crud/move-selection";

const mover = createMoveSelection(doc);

// Move the [b, c] block to just after d, preserving internal order.
mover.moveSelection(["/rows/1", "/rows/2"], { after: "/rows/3" });

// Move a single row up.
mover.moveSelection(["/rows/3"], { before: "/rows/1" });
```

## Scope

- Move a contiguous run of selected sibling JSON array items as one block.
- Target a reference sibling with `{ before }` or `{ after }`; internal order is
  preserved.
- Same parent array only.
- Return planned operations and `selectionAfter` (the block's new pointers).
- Expose `canMoveSelection` beside `moveSelection`.

## Non-goals

- Single-item moves — use `@zod-crud/collection` (`moveUp`/`moveDown`/`moveBefore`/`moveAfter`).
- Drag/drop DOM intent — use the `drag-drop` lab.
- Cross-array moves (that is clipboard `cut`/`paste`), 2D grid moves, rendered
  list UI, keyboard, or focus policy.
- No stable identity tracking; host code owns id-to-pointer policy when needed.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Friction report

The public facade is enough. The block is computed in memory and applied as a
single `replace` of the parent array, preflighted with `doc.canPatch` — compact
and schema-safe, at the cost of per-item Pointer continuity (hosts that need it
should pair this with stable ids).

Seam pressure observed (matches the contract-pressure-register watchlist and
RFC #87):

- **Selected sibling normalization + contiguous range check.** Turning the
  selected pointers into a parent + sorted, contiguous index run is hand-written
  here, identical in shape to `fill-series`, `grouping`, `wrap-unwrap`, and
  `layer-order`. This is the **sixth** independent re-derivation of the same
  primitive — `resolveSiblingRange` (RFC #87) would replace all of it, leaving
  only the block-splice logic that is unique to this feature.
- **`selectionAfter` planning.** The moved block maps to a fresh contiguous
  pointer run; computing it is trivial once the new array index is known. The
  open question stays whether `operations` / `selectionAfter` should converge to
  one shared structural-result shape.
- **No core gap for the feature itself.** Block move needs no new core concept.
