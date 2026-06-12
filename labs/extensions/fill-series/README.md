# @interactive-os/json-document-fill-series

Lab fill/series propagation extension for `@interactive-os/json-document` documents.

Use it to test whether spreadsheet-style autofill and linear series can stay
outside core while using only the public document facade.

```ts
import { createFillSeries } from "@interactive-os/json-document-fill-series";

const filler = createFillSeries(doc);

// Constant fill into one field across a contiguous range.
filler.fill(["/rows/1", "/rows/2", "/rows/3"], { value: 0 }, { field: "/qty" });

// Linear numeric series (start + offset * step).
filler.fill(["/rows/1", "/rows/2", "/rows/3"], { series: { start: 10, step: 5 } }, { field: "/qty" });

// Seed-inferred series: start is read from the first cell when omitted.
filler.fill(["/rows/1", "/rows/2"], { series: { step: 1 } }, { field: "/qty" });

// Host generator with per-cell context.
filler.fill(["/rows/1", "/rows/2"], { from: (cell) => `row-${cell.index}` }, { field: "/label" });
```

## Scope

- Fill a contiguous run of sibling JSON array items.
- Three host-chosen generators: constant `{ value }`, linear numeric
  `{ series: { step, start? } }`, and a host `{ from }` generator.
- Write the whole item or a relative sub-pointer `field` inside each item.
- Normalize an unordered target into a sorted, contiguous range.
- Return planned operations, computed `values`, and `selectionAfter` before
  mutating.
- Expose `canFill` beside `fill`.

## Non-goals

- No date, locale, or pattern-detected series. Those are derivation; the host
  owns them through the `from` generator.
- No non-contiguous multi-selection fill, 2D grid fill, or fill-handle drag UI.
- No rendered table, spreadsheet, keyboard, or focus policy.
- No stable identity tracking; host code owns id-to-pointer policy when needed.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `@interactive-os/json-document` internal imports.

## Friction report

The public facade is enough to express constant fill, linear series, and a host
generator. The flow is: normalize the target with `resolveSiblingRange`, read
current cell values with `doc.at`, build per-cell `replace` operations,
preflight the whole batch with `doc.canPatch`, then apply with `doc.patch`.
Schema safety falls out of `canPatch` for free — a numeric series aimed at a
string field is rejected as `patch_rejected` and nothing is applied.

Resolved core pressure:

- Selected sibling normalization / contiguous range check moved to
  `resolveSiblingRange` after enough independent labs repeated it.
- This lab maps `resolveSiblingRange` errors back to its existing error codes so
  the feature contract stays stable.
- `selectionAfter` remains a lab convention, not a core concept yet.
