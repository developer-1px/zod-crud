# @interactive-os/json-document-grid-range

Lab grid-range editing extension for sparse-record-backed `@interactive-os/json-document` documents.

Use it when a product stores grid cells in a keyed JSON record and wants to
delegate rectangle paste/fill planning:

```ts
import { createGridRange } from "@interactive-os/json-document-grid-range";

const grid = createGridRange(doc);

grid.paste({
  root: "/cells",
  range: { row: 0, column: 0, rowCount: 2, columnCount: 2 },
  matrix: [
    ["A1", "B1"],
    ["A2", "B2"],
  ],
  keyForCell: ({ row, column }) => `${columnName(column)}${row + 1}`,
});
```

The app still owns visual selection, A1 naming, formula parsing, TSV/CSV
parsing, and what counts as product-level empty. This package owns rectangular
coordinate expansion, sparse add/replace/remove/no-op planning, schema
preflight, and one document mutation boundary.

## Scope

- Paste a rectangular `unknown[][]` matrix into a sparse-record-backed grid
  range.
- Fill a target grid range from a source grid range by repeating the source
  rectangle pattern by default.
- Accept host-owned `keyForCell`, bounds, value-to-intent, fill-intent
  generation, and equality hooks.
- Plan entry-level `add`, `replace`, `remove`, and `noop` decisions with one
  `doc.canPatch` preflight and one `doc.patch` apply.
- Return structured cell decisions, operation counts, planned JSON Patch
  operations, and `selectionAfter` coordinates for focus/selection recovery.

## Non-goals

- No DOM selection, focus handling, hit testing, keyboard policy, or rendered
  grid UI.
- No A1/RC coordinate naming policy, row/column header model, bounds discovery,
  formula language, displayed value semantics, or clipboard parsing.
- No CSV/TSV quoting, merged cells, auto-grow rows/columns, or built-in
  date/pattern series inference.
- No plugin registration; no `@interactive-os/json-document` internal imports.

## Friction report

The current lab catalog has adjacent pieces, but none owns this exact feature
boundary:

- `paste-cells` maps a matrix onto contiguous array rows and fixed fields.
- `fill-series` and `fill-down` work over sibling array ranges.
- `sparse-record` owns keyed record entry add/replace/remove/no-op planning,
  but intentionally does not expand 2D grid coordinates.

Sparse-record-backed editors still need a reusable command that starts at grid
intent: paste this rectangle, or fill that range from this source range. The
host provides coordinate naming and product normalization; json-document owns the
document-safe sparse record edit procedure.

`fill` keeps repeat-only behavior as the default because it is a common grid
operation and requires no product semantics. Products that need arithmetic
series, date series, formula-relative values, or copy-vs-series policy can pass
`generateFillIntent`; the package still owns applying those generated intents
as one sparse record edit command.
