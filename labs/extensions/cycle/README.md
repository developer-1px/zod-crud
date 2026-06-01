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

Boolean toggle needs nothing from the schema. For enum/select fields the host
must pass `values`, because `doc.schema.describe` reports `kind: "enum"` but does
**not** expose the option set in `SchemaDescription.allowed` (only
`discriminatedUnion` populates it). This is the same introspection gap recorded
by `@zod-crud/clear-values`: exposing `allowed` for enum/literal would let cycle
derive the option order generically instead of requiring host-supplied `values`.
