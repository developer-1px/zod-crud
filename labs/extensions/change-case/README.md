# @zod-crud/change-case

Lab change-case extension for `zod-crud` documents.

Use it to apply a case/whitespace transform to a string field, using only the
public document facade.

```ts
import { createChangeCase } from "@zod-crud/change-case";

const t = createChangeCase(doc);

t.transform("/title", "upper");      // HELLO
t.transform("/title", "trim");       // strip ends
t.transform("/title", "title");      // Title Case
t.transform("/title", (v) => v.normalize("NFC")); // host transform
```

## Scope

- Apply a named transform (`upper`, `lower`, `trim`, `capitalize`, `title`) or a
  host `(value: string) => string` function to a string field.
- Return `from`/`to` and planned operations; preflight with `doc.canPatch`.
- Expose `canTransform` beside `transform`.

## Non-goals

- Locale-aware casing, Unicode segmentation beyond JS string methods, or
  rendered text-format toolbars.
- Multi-field/range application (call per pointer) — kept single-field for now.
- No plugin registration; no `zod-crud` internal imports.

## Friction report

The public facade is enough: read the string with `doc.at`, transform, preflight
with `doc.canPatch`, apply. Schema string constraints (e.g. `regex`, `max`) are
enforced by `canPatch` as `patch_rejected` with nothing applied. The host
function escape hatch keeps locale/Unicode policy out of the lab while the named
transforms cover the common cases.
