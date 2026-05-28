# @zod-crud/text-search

Lab text search and replace extension for `zod-crud` documents.

Use it to test whether document-wide text search can stay outside core while
using only public document traversal and patch APIs.

```ts
import { createTextSearch } from "@zod-crud/text-search";

const text = createTextSearch(doc);

const matches = text.find("draft", { root: "/pages" });
text.replaceAll("draft", "published");
```

## Scope

- Traverse a document or subtree through `doc.entries`.
- Find occurrences inside string values.
- Plan replacement patches for matched string values.
- Preflight replacement with `doc.canPatch`.
- Apply replacement with `doc.patch`.

## Non-goals

- No rendered search box, result list, selection UI, highlight UI, keyboard, or
  focus policy.
- No full-text indexing, stemming, language analysis, fuzzy search, or regex
  engine.
- No product-specific field weighting.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Friction report

The public facade is enough for simple document-wide search and replace:
`entries` gives structural traversal, `at` gives values, and replacement is a
normal JSON Patch batch.

This extension intentionally does not ask core for text indexing or UI
highlighting. Those are product policies. The useful core contract is stable
Pointer addressing plus batch patch preflight.
