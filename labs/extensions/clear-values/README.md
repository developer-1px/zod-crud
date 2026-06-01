# @zod-crud/clear-values

Lab clear-values extension for `zod-crud` documents.

Use it to test whether resetting selected fields to an empty value (keeping
structure) can be driven from schema introspection alone, using only the public
document facade.

```ts
import { createClearValues } from "@zod-crud/clear-values";

const clearer = createClearValues(doc);

// Reset scalar/array/record fields to their type-empty value.
clearer.clearValues(["/title", "/count", "/tags"]);

// Host policy for kinds that cannot be derived (enum, object, union, ...).
clearer.clearValues(["/status"], { emptyFor: () => "todo" });
```

## Scope

- Reset each target pointer to an empty value, keeping the surrounding
  structure (this is "clear contents", not "delete").
- Derivation order: `jsonSchema.default`, then a type-empty by kind
  (string→`""`, number→`0`, boolean→`false`, null/nullable→`null`, array→`[]`,
  record→`{}`).
- Non-derivable kinds require host policy via `options.emptyFor`; otherwise
  `cannot_derive_empty`.
- Per-target schema safety via `doc.canPatch` (a `min(1)` string cleared to `""`
  is rejected); return planned operations and `selectionAfter`.
- Expose `canClearValues` beside `clearValues`.

## Non-goals

- Structural removal — use `delete`.
- Replacing many positions with a caller-supplied value — use `@zod-crud/bulk-edit`.
- Choosing the "default option" for enums/objects — host policy via `emptyFor`.
- Rendered UI, keyboard, or focus policy.
- No plugin registration; no `zod-crud` internal imports.

## Friction report

Unlike the move/fill/grid labs (which re-derive the selection-range seam, RFC
\#87), clear-values pressure-tests **schema introspection**: is
`doc.schema.describe` enough to compute an empty value for a slot?

Answer: **partially.**

- Enough for scalars, arrays, records, nullable, and any field carrying a
  `jsonSchema.default`.
- **Not enough** for several kinds, and the gaps are in the public
  `SchemaDescription` shape, not in the concept:
  - `enum`/`literal`: `describe` reports `kind: "enum"` but does **not** populate
    `allowed` (only `discriminatedUnion` fills it), so the option set is invisible
    without parsing `jsonSchema`. There is no neutral "empty" enum value anyway,
    so host policy is reasonable — but exposing `allowed` for enums would let a
    host pick the first option generically.
  - defaulted fields report `kind: "unknown"` (the `ZodDefault` wrapper is not
    unwrapped); only `jsonSchema.default` reveals intent.
  - `object` empties depend on required keys (`{}` usually fails validation), and
    `union`/`optional` have no single empty.

Core feedback (schema-introspection-contract): consider populating
`SchemaDescription.allowed` for `enum`/`literal`, and exposing the unwrapped
inner kind for defaulted fields. Until then, `emptyFor` keeps the policy
host-owned, which is the correct boundary for ambiguous kinds regardless.
