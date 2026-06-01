# @zod-crud/fill-series

Lab fill/series propagation extension for `zod-crud` documents.

Use it to test whether spreadsheet-style autofill and linear series can stay
outside core while using only the public document facade.

```ts
import { createFillSeries } from "@zod-crud/fill-series";

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
- No `zod-crud` internal imports.

## Friction report

The public facade is enough to express constant fill, linear series, and a host
generator. The flow is: normalize the target with the public Pointer utilities
(`tryParsePointer`, `lastSegmentIndex`, `parentPointer`, `appendSegment`), read
current cell values with `doc.at`, build per-cell `replace` operations, preflight
the whole batch with `doc.canPatch`, then apply with `doc.patch`. Schema safety
falls out of `canPatch` for free — a numeric series aimed at a string field is
rejected as `patch_rejected` and nothing is applied.

Seam pressure observed (matches the contract-pressure-register watchlist):

- **Selected sibling normalization / contiguous range check.** Turning a set of
  selected item pointers into a parent + sorted index run is hand-written here
  (shared parent, sort, `start + offset` contiguity). This is the same
  normalization that `bulk-edit`, `grouping`, and `wrap-unwrap` re-derive. The
  public API exposes the Pointer arithmetic but not "is this selection a single
  contiguous sibling range", so each extension reimplements it.
- **`selectionAfter` planning.** The fill range maps cleanly to item pointers, so
  `selectionAfter` is trivial here. The recurring question is whether this field
  should converge to one shared shape (`operations` / `selectionAfter` /
  `diagnostics`) across structural extensions rather than each naming its own.
- **No core gap for the feature itself.** Fill/series does not need a new core
  primitive. The only thing core could remove is the repeated selection-range
  normalization, and that should be proven across three independent extensions
  before it moves anywhere near core.
