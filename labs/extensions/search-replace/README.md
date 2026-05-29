# @zod-crud/search-replace

Lab search and replace extension for `zod-crud` documents.

Use it to test whether document-wide search and replace can stay outside core while
using only public document traversal and patch APIs.

```ts
import { createSearchReplace } from "@zod-crud/search-replace";

const text = createSearchReplace(doc);

const matches = text.find("draft", { root: "/pages" });
if (matches.ok) {
  text.replaceMatch({
    pointer: matches.matches[0].pointer,
    range: matches.matches[0].ranges[0],
  }, "published");
}
text.replaceAll("draft", "published");
```

Host apps can limit search to product-visible text fields:

```ts
text.replaceAll("draft", "published", {
  include: ({ pointer }) =>
    pointer.endsWith("/title") || pointer.endsWith("/body"),
});
```

## Scope

- Traverse a document or subtree through `doc.entries`.
- Find occurrences inside string values.
- Let the host filter searchable string fields with an `include` predicate.
- Plan replacement patches for one current match or all matched string values.
- Preflight replacement with `doc.canPatch`.
- Apply replacement with `doc.replace` or `doc.patch`.

## Non-goals

- No rendered search box, result list, selection UI, highlight UI, keyboard, or
  focus policy.
- No full-text indexing, stemming, language analysis, fuzzy search, or regex
  engine.
- No built-in product-specific field taxonomy, weighting, ranking, or result
  grouping.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Friction report

The public facade is enough for simple document-wide search and replace:
`entries` gives structural traversal, `at` gives values, one-match replacement
uses `canReplace`/`replace`, and replace-all is a normal JSON Patch batch.

This extension intentionally does not ask core for text indexing or UI
highlighting. Those are product policies. The useful core contract is stable
Pointer addressing plus mutation preflight.

Dogfooding in canvas showed that most products need a searchable-field policy:
visible text should be searched, while identity, style, and storage strings
should not be changed. The extension now accepts host-owned `include` filtering
so `find`, `canReplaceAll`, and `replaceAll` share the same target policy
without forcing apps to rebuild replacement patches.
