# @zod-crud/split-text

Lab split-text extension for `zod-crud` documents.

Use it to split a string into array items (tag input, paste-as-list), using only
the public document facade.

```ts
import { createSplitText } from "@zod-crud/split-text";

const s = createSplitText(doc);

s.split("/tags", "react, ts ,zod");          // ["react", "ts", "zod"]
s.split("/tags", "a;b|c", { delimiter: /[;|]/ });
s.split("/tags", "a,b", { append: true });   // append to existing
```

## Scope

- Split `text` by a delimiter (string or RegExp, default `","`) into an array of
  parts, written at an array Pointer.
- `trim` (default on), `dropEmpty` (default on), `dedupe` (default off), and
  `append` (default off — replaces).
- Schema array constraints are enforced by `doc.canPatch`; return the parsed
  `parts` and planned operations.
- Expose `canSplit` beside `split`.

## Non-goals

- CSV/TSV parsing with quoting/escaping, or split-to-columns (2D) — host owns
  real parsing; this is delimiter splitting into a 1D list.
- Clipboard access or rendered tag/chip UI.
- No plugin registration; no `zod-crud` internal imports.

## Friction report

The public facade is enough: split/trim/filter in memory, preflight the array
replacement with `doc.canPatch`, then apply. This is the tag-input / paste-as-list
case (one delimiter into a flat list), deliberately distinct from grid-paste
(2D matrix → rectangle) and from full CSV parsing, which stays host-owned.
