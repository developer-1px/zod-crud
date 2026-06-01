# @zod-crud/fill-down

Lab fill-down extension for `zod-crud` documents.

Use it to carry the last non-empty value into the empty slots that follow it
(spreadsheet "fill down blanks", `pandas` ffill, unmerge cleanup), using only the
public document facade.

```ts
import { createFillDown } from "@zod-crud/fill-down";

const f = createFillDown(doc);

f.fillDown("/rows", { field: "/group" });             // carry previous down
f.fillDown("/rows", { field: "/group", direction: "up" }); // carry next up
```

## Scope

- Fill each empty item/field with the most recent non-empty value in the chosen
  direction (`down` default, or `up`). Leading empties (before any value) stay
  empty.
- Default emptiness: `null`, `undefined`, `""`; override with `options.isEmpty`.
- Report `filled` and planned operations; preflight with `doc.canPatch`.
- Expose `canFillDown` beside `fillDown`.

## Non-goals

- Interpolating between values (that is a numeric series — see
  `@zod-crud/fill-series`).
- Filling from a constant (that is `@zod-crud/fill-blanks`).
- Nested field paths beyond one segment, or rendered grid UI.
- No plugin registration; no `zod-crud` internal imports.

## Friction report

The public facade is enough: walk the array carrying the last non-empty value,
emit a `replace` per filled slot, preflight as one `doc.canPatch` batch, apply.
Distinct from the other fills: `fill-blanks` uses one constant, `fill-series`
extrapolates a numeric series, and fill-down **propagates the neighbor** — the
classic unmerge / fill-down-blanks data-cleanup step.
