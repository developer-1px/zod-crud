# @zod-crud/paste-cells

Lab paste-cells extension for `zod-crud` documents.

Use it to test whether pasting a 2D value matrix onto a rectangular region of an
array-of-records can stay outside core while using only the public document
facade.

```ts
import { createPasteCells } from "@zod-crud/paste-cells";

const grid = createPasteCells(doc);

// Paste a 2x2 block starting at row 1, columns name + qty.
grid.pasteGrid({ at: "/rows/1", fields: ["/name", "/qty"] }, [
  ["x", 10],
  ["y", 20],
]);
```

## Scope

- Map a host-parsed `unknown[][]` matrix onto a rectangle: rows are contiguous
  array items starting at `at`, columns are relative `fields` sub-pointers.
- Ragged rows write only the provided columns; extra columns beyond `fields` are
  ignored.
- Reject a region that runs past the array end (`region_out_of_range`).
- Schema safety per cell via `doc.canPatch`; return planned operations and
  `selectionAfter`.
- Expose `canPasteGrid` beside `pasteGrid`.

## Non-goals

- TSV/CSV string parsing and clipboard I/O — host-owned. Input is an already
  parsed value matrix.
- Auto-growing the array when the region overflows — host owns the row factory.
- Merged cells, 2D grid selection UI, rendered table, keyboard, or focus policy.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Friction report

The public facade is enough: resolve the top-left with the Pointer utilities,
build one `replace` per cell, preflight the batch with `doc.canPatch`, then
apply. A string pasted into a numeric column is rejected as `patch_rejected`
with nothing applied.

This lab answers the contract-pressure-register question of whether grid paste is
distinct from `paste-special`:

- **`paste-special` adapts payload _shape_** — one payload reshaped/ID-remapped
  to fit a single target slot.
- **`paste-cells` maps a _rectangle_** — a 2D matrix distributed across a
  contiguous row range and a fixed column (field) order.

They are distinct responsibilities. The recurring host-owned boundary is clear:
parsing the clipboard string into a matrix, the column-to-field mapping policy,
and auto-grow all stay with the host. The engine only needs per-cell schema-safe
`replace`, so no new core concept is required.
