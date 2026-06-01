# @zod-crud/truncate

Lab truncate extension for `zod-crud` documents.

Use it to cap a string field to a maximum length (excerpts/summaries, SEO meta
descriptions), using only the public document facade.

```ts
import { createTruncate } from "@zod-crud/truncate";

const t = createTruncate(doc);

t.truncate("/summary", 160);                                  // hard cap
t.truncate("/summary", 160, { ellipsis: "…" });               // … within budget
t.truncate("/excerpt", 120, { wordBoundary: true, ellipsis: "..." });
```

## Scope

- Cap a string to `maxLength` characters; an `ellipsis` is counted within the
  budget, and `wordBoundary` trims at the last whitespace within the limit.
- A string already within the limit is a no-op; the result never exceeds
  `maxLength`.
- Schema string constraints are enforced by `doc.canPatch`; return `from`/`to`
  and planned operations.
- Expose `canTruncate` beside `truncate`.

## Non-goals

- Display-time truncation (CSS ellipsis / render layer) — this changes the
  stored value.
- Grapheme/locale-aware length (counts UTF-16 code units like `String.length`).
- No plugin registration; no `zod-crud` internal imports.

## Friction report

The public facade is enough: read the string, cut in memory, preflight with
`doc.canPatch`, apply. The common stored-truncation cases — excerpt/summary
fields and SEO meta-description caps — fit cleanly. Grapheme-accurate counting
(emoji, combining marks) stays host-owned; this uses code-unit length like the
platform `String.length`.
