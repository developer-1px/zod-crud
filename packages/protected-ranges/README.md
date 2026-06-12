# @interactive-os/json-document-protected-ranges

Official headless protected range guard extension for `@interactive-os/json-document` documents.

Use it when the schema accepts an edit, but the product policy says a JSON
Pointer range is locked or protected: published fields, legal copy, locked
settings, import targets, generated sections, or moderated content.

```ts
import { createProtectedRanges } from "@interactive-os/json-document-protected-ranges";

const protectedRanges = createProtectedRanges(doc, [
  { id: "published-slug", pointer: "/slug", label: "Published slug" },
]);

protectedRanges.canReplace("/slug", "next");
protectedRanges.replace("/title", "Next title");
```

## Scope

- Keep a small headless protected range registry.
- Guard direct document edits before calling public `@interactive-os/json-document` operations.
- Preserve core capability and mutation failures after the protection check.
- Detect direct subtree writes and array insert/remove shifts that would move a
  protected item.

## Non-goals

- No UI lock icons, focus handling, keyboard policy, or permissions dialog.
- No authentication, role model, server authorization, or collaboration policy.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `@interactive-os/json-document` internal imports.

## Contract

`@interactive-os/json-document-protected-ranges` wraps public `can*` and execute methods and returns
feature-level disabled reasons before the core schema check runs.

The pressure point is shared guard composition: if comments, snippets,
drag/drop, schema-form, and bulk-edit all need to ask the same policy guard
before executing, a product-neutral capability guard primitive may become a core
candidate. Keep that as evidence, not an immediate core change.
