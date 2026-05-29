# @zod-crud/protected-ranges

Lab protected range guard extension for `zod-crud` documents.

Use it when the schema accepts an edit, but the product policy says a JSON
subtree is locked or protected.

```ts
import { createProtectedRanges } from "@zod-crud/protected-ranges";

const protectedRanges = createProtectedRanges(doc, [
  { id: "published-slug", pointer: "/slug", label: "Published slug" },
]);

protectedRanges.canReplace("/slug", "next");
protectedRanges.replace("/title", "Next title");
```

## Scope

- Keep a small headless protected range registry.
- Guard direct document edits before calling public `zod-crud` operations.
- Preserve core capability and mutation failures after the protection check.
- Detect direct subtree writes and array insert/remove shifts that would move a
  protected item.

## Non-goals

- No UI lock icons, focus handling, keyboard policy, or permissions dialog.
- No authentication, role model, server authorization, or collaboration policy.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Friction report

The public facade is enough for simple protected JSON ranges. The package can
wrap public `can*` and execute methods and return feature-level disabled
reasons before the core schema check runs.

The pressure point is shared guard composition: if comments, snippets,
drag/drop, schema-form, and bulk-edit all need to ask the same policy guard
before executing, a product-neutral capability guard primitive may become a core
candidate. Keep that as evidence, not an immediate core change.
