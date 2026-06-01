# @zod-crud/pad-text

Lab pad-text extension for `zod-crud` documents.

Use it to pad a string field to a minimum length (zero-padded codes/IDs,
fixed-width labels), using only the public document facade.

```ts
import { createPadText } from "@zod-crud/pad-text";

const p = createPadText(doc);

p.padText("/code", 5, { fill: "0" });               // "42" -> "00042"
p.padText("/label", 10, { fill: " ", side: "end" }); // right-pad
```

## Scope

- Pad a string to `length` with a `fill` string (default `" "`) on the start
  (default) or end, via `String.padStart`/`padEnd` semantics.
- A string already at/over `length` is a no-op.
- Schema string constraints are enforced by `doc.canPatch`; return `from`/`to`
  and planned operations.
- Expose `canPadText` beside `padText`.

## Non-goals

- Number formatting (use `@zod-crud/convert-type` to a string first, or format on the
  host) — pad operates on string fields.
- Display-time alignment / monospace layout (render concern).
- No plugin registration; no `zod-crud` internal imports.

## Friction report

The public facade is enough: read the string, pad in memory, preflight with
`doc.canPatch`, apply. The common stored-padding case is zero-padded codes/IDs
(`"42"` → `"00042"`). Number-to-padded-string starts with a `convert-type` to string;
display-time alignment stays a render concern.
