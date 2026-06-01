# @zod-crud/clear-contents

Lab clear-contents extension for `zod-crud` documents.

Use it to test whether resetting selected fields to an empty value (keeping
structure) can be driven from schema introspection alone, using only the public
document facade.

```ts
import { createClearContents } from "@zod-crud/clear-contents";

const clearer = createClearContents(doc);

// Reset scalar/array/record fields to their type-empty value.
clearer.clearContents(["/title", "/count", "/tags"]);

// Host policy for kinds that cannot be derived (enum, object, union, ...).
clearer.clearContents(["/status"], { emptyFor: () => "todo" });
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
- Expose `canClearContents` beside `clearContents`.

## Non-goals

- Structural removal — use `delete`.
- Replacing many positions with a caller-supplied value — use `@zod-crud/bulk-edit`.
- Choosing the "default option" for enums/objects — host policy via `emptyFor`.
- Rendered UI, keyboard, or focus policy.
- No plugin registration; no `zod-crud` internal imports.

## Friction report

Unlike the move/fill/grid labs (which re-derive the selection-range seam, RFC
\#87), clear-contents pressure-tests **schema introspection**: is
`doc.schema.describe` enough to compute an empty value for a slot?

Answer: **partially.**

- Enough for scalars, arrays, records, nullable, and any field carrying a
  `jsonSchema.default`.
- `enum`/`literal` now expose `SchemaDescription.allowed`, which helps readers
  enumerate closed sets. Clear-values still does not pick one automatically:
  there is no neutral "empty" enum value, so host policy belongs in `emptyFor`.
- Defaulted fields expose intent through `jsonSchema.default`; object, union,
  and optional fields still do not have one product-neutral empty.

No further core change is recommended for this lab. `emptyFor` keeps ambiguous
empty policy host-owned.
