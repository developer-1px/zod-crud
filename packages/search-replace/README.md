# @interactive-os/json-document-search-replace

Official headless search and replace extension for text fields in `@interactive-os/json-document`
documents.

Use it when a product needs document-wide or subtree text search over JSON
string fields: block documents, CMS copy review, generated admin editors,
slide notes, import cleanup, or settings search.

```ts
import { createSearchReplace } from "@interactive-os/json-document-search-replace";

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

## Advanced Search Modes

`@interactive-os/json-document-search-replace` intentionally standardizes literal JSON string-field
find/replace. Regex, fuzzy search, stemming, tokenization, locale collation, and
rendered-text search stay host-owned until those behaviors repeat across
products with the same safety and result semantics.

For regex search, the host owns:

- pattern syntax and invalid-pattern diagnostics
- flags, capture groups, backreference replacement, and match overlap policy
- regex safety policy, such as timeout, length, and catastrophic-backtracking
  limits
- rendered text extraction, ranking, grouping, and advanced-mode UI
- deciding whether a stale search snapshot should be recomputed or rejected

`@interactive-os/json-document` still owns the document mutation boundary once the host has a current
JSON string target. A host can compute a regex match range itself, then call
`canReplaceMatch` or `replaceMatch` with `{ pointer, range }` to reuse stale text
checks, schema preflight, and the atomic `doc.replace` operation for that one
current match.

Regex replace-all remains host-owned in this package because capture
substitution and product safety rules decide the replacement text. Hosts that
compute a full next document or patch batch can still delegate final document
validation and mutation through core `doc.canPatch` / `doc.patch`,
`@interactive-os/json-document-patch-preview`, or a diff/apply feature.

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
- No rendered text extraction from Markdown, HTML, ProseMirror, canvas text, or
  custom rich text formats.
- No full-text indexing, stemming, language analysis, fuzzy search, or regex
  engine or regex replacement grammar.
- No built-in product-specific field taxonomy, weighting, ranking, or result
  grouping.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `@interactive-os/json-document` internal imports.

## Contract

The public facade is enough for document string-field search and replace:
`entries` gives structural traversal, `at` gives values, one-match replacement
uses `canReplace`/`replace`, and replace-all is a JSON Patch batch through
`canPatch`/`patch`.

This extension intentionally does not ask core for text indexing or UI
highlighting. Those are product policies. The useful core contract is stable
Pointer addressing plus mutation preflight.

Most products need a searchable-field policy: visible copy should be searched,
while identity, style, and storage strings should not be changed. Pass
host-owned `include` filtering so `find`, `canReplaceAll`, and `replaceAll`
share the same target policy without forcing apps to rebuild replacement
patches.
