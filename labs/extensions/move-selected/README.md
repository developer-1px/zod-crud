# @interactive-os/json-document-move-selected

Lab move-selected extension for `@interactive-os/json-document` documents.

Use it to test whether moving a contiguous block of selected sibling items to a
new position can stay outside core while using only the public document facade.

```ts
import { createMoveSelected } from "@interactive-os/json-document-move-selected";

const mover = createMoveSelected(doc);

// Move the [b, c] block to just after d, preserving internal order.
mover.moveSelected(["/rows/1", "/rows/2"], { after: "/rows/3" });

// Move a single row up.
mover.moveSelected(["/rows/3"], { before: "/rows/1" });
```

## Scope

- Move a contiguous run of selected sibling JSON array items as one block.
- Target a reference sibling with `{ before }` or `{ after }`; internal order is
  preserved.
- Same parent array only.
- Return planned operations and `selectionAfter` (the block's new pointers).
- Expose `canMoveSelected` beside `moveSelected`.

## Non-goals

- Single-item moves — use `@interactive-os/json-document-collection` (`moveUp`/`moveDown`/`moveBefore`/`moveAfter`).
- Drag/drop DOM intent — use the `drag-drop` lab.
- Cross-array moves (that is clipboard `cut`/`paste`), 2D grid moves, rendered
  list UI, keyboard, or focus policy.
- No stable identity tracking; host code owns id-to-pointer policy when needed.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `@interactive-os/json-document` internal imports.

## Friction report

The public facade is enough. The block is computed in memory and applied as a
single `replace` of the parent array, preflighted with `doc.canPatch` — compact
and schema-safe, at the cost of per-item Pointer continuity (hosts that need it
should pair this with stable ids).

Seam pressure observed (matches the contract-pressure-register watchlist and
RFC #87):

- **Selected sibling normalization + contiguous range check.** This is now
  delegated to core `resolveSiblingRange`, leaving only the block-splice logic
  that is unique to this feature. The lab maps helper errors back to its
  existing error codes.
- **`selectionAfter` planning.** The moved block maps to a fresh contiguous
  pointer run; computing it is trivial once the new array index is known. The
  open question stays whether `operations` / `selectionAfter` should converge to
  one shared structural-result shape.
- **No core gap for the feature itself.** Block move needs no new core concept.
