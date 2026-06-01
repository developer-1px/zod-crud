# @zod-crud/slugify

Lab slugify extension for `zod-crud` documents.

Use it to derive a URL-safe slug from a string field (CMS title → slug), using
only the public document facade.

```ts
import { createSlugify } from "@zod-crud/slugify";

const s = createSlugify(doc);

s.slugify("/title", "/slug");                    // "Hello, World!" -> "hello-world"
s.slugify("/title", "/slug", { separator: "_", lower: false });
s.slugify("/title", "/slug", { maxLength: 60 });
```

## Scope

- Derive a slug from a `source` string and write it to a `target` string field.
- Lowercase (default), strip diacritics (NFKD), collapse non-alphanumeric runs to
  a `separator` (default `"-"`), trim edge separators, optional `maxLength` trimmed
  at a boundary.
- Schema constraints on the target are enforced by `doc.canPatch`; return the
  computed `slug` and planned operations.
- Expose `canSlugify` beside `slugify`.

## Non-goals

- Uniqueness/collision handling (appending `-2`) — host policy, often needs a
  lookup against other records.
- Transliteration of non-Latin scripts (CJK, Cyrillic → Latin) — host-owned.
- No plugin registration; no `zod-crud` internal imports.

## Friction report

The public facade is enough: read the source string, compute the slug, preflight
the target write with `doc.canPatch`, apply. This is the ubiquitous CMS
"title → slug" derivation. Two things stay deliberately host-owned because they
need state beyond this one field: **uniqueness** (needs to see other slugs) and
**transliteration** of non-Latin scripts (locale/library policy). The lab covers
the Latin + diacritics common case and leaves those at the boundary.
