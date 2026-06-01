# @zod-crud/coerce

Lab coerce extension for `zod-crud` documents.

Use it to convert a field's runtime type (string ↔ number ↔ boolean), using only
the public document facade.

```ts
import { createCoerce } from "@zod-crud/coerce";

const c = createCoerce(doc);

c.coerce("/val", "number");   // "5"   -> 5
c.coerce("/val", "integer");  // "5.9" -> 5
c.coerce("/val", "string");   // 42    -> "42"
c.coerce("/val", "boolean");  // "yes" -> true
```

## Scope

- Convert to `"string"`, `"number"`, `"integer"`, or `"boolean"`.
- Numbers parse with `Number`/`Math.trunc`; booleans accept common spellings
  (`true/1/yes/y/on` and `false/0/no/n/off`). Non-coercible values report
  `not_coercible`.
- Schema is the source of truth: the coerced result is preflighted with
  `doc.canPatch`. Return `from`/`to` and planned operations.
- Expose `canCoerce` beside `coerce`.

## Non-goals

- Locale/format-aware parsing (currency, grouped digits, dates) — host-owned.
- Rendered input masks.
- No plugin registration; no `zod-crud` internal imports.

## Friction report

The public facade is enough. The notable interaction: coerce is only useful where
the field's schema **accepts** the target type — a permissive field
(`z.union([z.string(), z.number()])`, `z.unknown()`, or a `z.coerce.*` schema).
On a strict single-type field, the coerced result has the wrong type and
`doc.canPatch` rejects it as `patch_rejected`. That is correct behavior: the
schema, not the lab, decides what a field may hold. This makes coerce a clean
fit for loose/import-staging documents and a no-op-or-rejection on strict ones.
