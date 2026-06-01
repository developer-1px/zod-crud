# @zod-crud/round

Lab round extension for `zod-crud` documents.

Use it to round a numeric field to a precision or to the nearest step
(currency, measurements, slider snap), using only the public document facade.

```ts
import { createRound } from "@zod-crud/round";

const r = createRound(doc);

r.round("/price", { precision: 2 });          // 3.14159 -> 3.14
r.round("/price", { step: 0.25 });            // snap to 0.25 multiples
r.round("/price", { mode: "ceil" });          // round up to integer
```

## Scope

- Round a number with `mode` (`round`/`floor`/`ceil`/`trunc`), to a decimal
  `precision` (default 0) or to the nearest `step` multiple.
- Schema number constraints are enforced by `doc.canPatch`; return `from`/`to`
  and planned operations.
- Expose `canRound` beside `round`.

## Non-goals

- Currency/locale formatting or display strings (this changes the stored
  number, not its rendering).
- Incrementing/clamping — see `@zod-crud/number-step`.
- No plugin registration; no `zod-crud` internal imports.

## Friction report

The public facade is enough: read the number, round in memory, preflight with
`doc.canPatch`, apply. Distinct from `number-step` (which adds a delta with
optional clamp): round *snaps* an existing value to a precision or step grid —
the currency/measurement/slider-snap cleanup. Float drift is contained by a
scaled, fixed-precision round-trip.
