# @zod-crud/toggle-value

Lab toggle-value extension for `zod-crud` documents.

Use it to toggle a boolean or advance a field through an ordered set of values,
using only the public document facade.

```ts
import { createToggleValue } from "@zod-crud/toggle-value";

const c = createToggleValue(doc);

c.toggleValue("/done"); // boolean toggle
c.toggleValue("/status", { values: ["todo", "doing", "review", "done"] }); // next
c.toggleValue("/status", { values: STATUSES, direction: "prev" }); // previous
```

## Scope

- Toggle a boolean field, or advance/retreat a field through `options.values`
  or schema `allowed` values when `values` is omitted (wraps around). A current
  value outside the list jumps to the first entry.
- Return `from`/`to` and planned operations; preflight with `doc.canPatch`.
- Expose `canToggleValue` beside `toggleValue`.

## Non-goals

- Guessing product-specific order when schema order is not the desired order;
  host passes `values` for that case.
- Rendered controls, keyboard, or focus policy.
- No plugin registration; no `zod-crud` internal imports.

## Friction report

Boolean toggle needs nothing from the schema. For enum fields, toggle-value now derives
the option set from `doc.schema.describe(pointer).allowed` when `values` is
omitted, so a select/status field advances with no host input.

This closes the introspection gap originally recorded here and by
`@zod-crud/clear-contents`: zod-crud now exposes `allowed` for enum/literal (not
just `discriminatedUnion`), so the option order comes from the schema. A host
`values` is still accepted to override the order or advance a non-enum field; a
plain string/number with neither a boolean type, schema `allowed`, nor `values`
is reported as `not_toggleable`.
