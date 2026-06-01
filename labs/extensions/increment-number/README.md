# @zod-crud/increment-number

Lab increment-number extension for `zod-crud` documents.

Use it to increment, decrement, or step a numeric field by an amount, with
optional clamping, using only the public document facade.

```ts
import { createIncrementNumber } from "@zod-crud/increment-number";

const n = createIncrementNumber(doc);

n.increment("/qty");                 // +1
n.decrement("/qty", { step: 5 });    // -5
n.step("/qty", { step: 2, max: 10 }); // +2, clamped to 10
```

## Scope

- Add `step` (default 1) to a numeric field; `increment`/`decrement` are
  direction-named wrappers.
- Optional `min`/`max` clamping of the result.
- Schema bounds are enforced by `doc.canPatch` (a step past a schema `max` is
  rejected); return `from`/`to` and planned operations.
- Expose `canStep` beside the mutators.

## Non-goals

- Rendered spinner/stepper controls, hold-to-repeat, or keyboard policy.
- Formatting, units, or currency.
- No plugin registration; no `zod-crud` internal imports.

## Friction report

The public facade is enough: read the number with `doc.at`, compute and clamp,
preflight with `doc.canPatch`, then apply. Schema range limits (`z.number().max`)
are caught by `canPatch` as `patch_rejected` with nothing applied, so the lab's
own `min`/`max` are an optional UX clamp on top of schema validation, not a
replacement for it.
