# @interactive-os/json-document-join-text

Lab join-text extension for `@interactive-os/json-document` documents.

Use it to join an array into a string field (the inverse of `@interactive-os/json-document-split-text`),
using only the public document facade.

```ts
import { createJoinText } from "@interactive-os/json-document-join-text";

const j = createJoinText(doc);

j.join("/tags", "/display");                       // "a, b, c"
j.join("/tags", "/display", { separator: " | " });
j.join("/nums", "/display", { map: (n) => `#${n}` });
```

## Scope

- Join the array at `source` into a string written at `target`.
- `separator` (default `", "`), a host `map(item, index)` (default: strings pass
  through, others via JSON), and `dropEmpty`.
- Schema constraints on the target string are enforced by `doc.canPatch`; return
  the joined `value` and planned operations.
- Expose `canJoin` beside `join`.

## Non-goals

- Locale-aware list formatting (`Intl.ListFormat`) — pass a host `map`/`separator`.
- Reading the result without writing — this is an editing action that sets a
  field; use `doc.at` + a host join for pure display.
- No plugin registration; no `@interactive-os/json-document` internal imports.

## Friction report

The public facade is enough: read the source array, map+join in memory, preflight
the target write with `doc.canPatch`, apply. Natural pair with `split-text`
(string → array); together they cover the tag-input round trip
(`split` on type, `join` for a derived display/export field). Locale formatting
stays host-owned via `map`/`separator`.
