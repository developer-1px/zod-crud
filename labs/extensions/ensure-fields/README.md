# @zod-crud/ensure-fields

Lab ensure-fields extension for `zod-crud` documents.

Use it to add missing object keys from a defaults map (settings/config
normalization, form initialization), using only the public document facade.

```ts
import { createEnsureFields } from "@zod-crud/ensure-fields";

const e = createEnsureFields(doc);

e.ensure("/settings", { theme: "light", fontSize: 14, compact: false });
// adds only the keys that are absent; never overwrites existing values
```

## Scope

- Add each `defaults` key that is **absent** from the object; never overwrite an
  existing key.
- Report the `added` keys and planned `add` operations; preflight with
  `doc.canPatch` (a default that fails schema validation is rejected).
- Expose `canEnsure` beside `ensure`.

## Non-goals

- Overwriting or filling existing-but-empty values — that is
  `@zod-crud/fill-empty`.
- Removing unknown keys (the opposite direction), or deep/nested merging — keys
  are added at the object's top level only.
- No plugin registration; no `zod-crud` internal imports.

## Friction report

The public facade is enough: read the object, diff its keys against the defaults
map, emit `add` ops for the missing ones, preflight as one `doc.canPatch` batch,
apply. This is the settings/config initialization case ("ensure every option has
a value"), the additive complement to `fill-empty` (which fills existing empty
slots). Nested/deep defaulting stays host-owned.

Like `coerce` and `clear-values`, the schema is the source of truth: ensure-fields
is meaningful only for keys the schema marks **optional** (a required key cannot
be absent to begin with), and any default that fails validation is rejected by
`doc.canPatch`.
