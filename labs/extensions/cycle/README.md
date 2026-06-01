# @zod-crud/cycle

Lab cycle extension for `zod-crud` documents.

Use it to toggle a boolean or advance a field through an ordered set of values,
using only the public document facade.

```ts
import { createCycle } from "@zod-crud/cycle";

const c = createCycle(doc);

c.cycle("/done"); // boolean toggle
c.cycle("/status", { values: ["todo", "doing", "review", "done"] }); // next
c.cycle("/status", { values: STATUSES, direction: "prev" }); // previous
```

## Scope

- Toggle a boolean field, or advance/retreat a field through `options.values`
  (wraps around). A current value outside the list jumps to the first entry.
- Return `from`/`to` and planned operations; preflight with `doc.canPatch`.
- Expose `canCycle` beside `cycle`.

## Non-goals

- Deriving enum options from the schema (see friction); host passes `values`.
- Rendered controls, keyboard, or focus policy.
- No plugin registration; no `zod-crud` internal imports.

## Friction report

Boolean toggle needs nothing from the schema. For enum fields, cycle now derives
the option set from `doc.schema.describe(pointer).allowed` when `values` is
omitted, so a select/status field cycles with no host input.

This closes the introspection gap originally recorded here and by
`@zod-crud/clear-values`: zod-crud now exposes `allowed` for enum/literal (not
just `discriminatedUnion`), so the option order comes from the schema. A host
`values` is still accepted to override the order or cycle a non-enum field; a
plain string/number with neither a boolean type, schema `allowed`, nor `values`
is reported as `not_cyclable`.
