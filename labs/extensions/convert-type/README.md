# @interactive-os/json-document-convert-type

Lab convert-type extension for `@interactive-os/json-document` documents.

Use it to convert a field's runtime type (string ↔ number ↔ boolean), using only
the public document facade.

```ts
import { createConvertType } from "@interactive-os/json-document-convert-type";

const c = createConvertType(doc);

c.convertType("/val", "number");   // "5"   -> 5
c.convertType("/val", "integer");  // "5.9" -> 5
c.convertType("/val", "string");   // 42    -> "42"
c.convertType("/val", "boolean");  // "yes" -> true
```

## Scope

- Convert to `"string"`, `"number"`, `"integer"`, or `"boolean"`.
- Numbers parse with `Number`/`Math.trunc`; booleans accept common spellings
  (`true/1/yes/y/on` and `false/0/no/n/off`). Non-convertible values report
  `not_convertible`.
- Schema is the source of truth: the convert-typed result is preflighted with
  `doc.canPatch`. Return `from`/`to` and planned operations.
- Expose `canConvertType` beside `convertType`.

## Non-goals

- Locale/format-aware parsing (currency, grouped digits, dates) — host-owned.
- Rendered input masks.
- No plugin registration; no `@interactive-os/json-document` internal imports.

## Friction report

The public facade is enough. The notable interaction: convert-type is only useful where
the field's schema **accepts** the target type — a permissive field
(`z.union([z.string(), z.number()])` or `z.unknown()`).
On a strict single-type field, the convert-typed result has the wrong type and
`doc.canPatch` rejects it as `patch_rejected`. That is correct behavior: the
schema, not the lab, decides what a field may hold. This makes convert-type a clean
fit for loose/import-staging documents and a no-op-or-rejection on strict ones.
