# @zod-crud/bookmarks

Headless bookmark tracking extension for `zod-crud` documents.

Lab status: private prototype. Not an official package.

```ts
import { createBookmarks } from "@zod-crud/bookmarks";

const bookmarks = createBookmarks(doc, {
  focusedTitle: "/items/0/title",
});

doc.insert("/items/0", { id: "new", title: "New" });

bookmarks.pointerFor("focusedTitle");
```

## Scope

- Store named JSON Pointer bookmarks outside the document.
- Validate bookmark targets with `doc.at(pointer)` before storing them.
- Track bookmark pointers through applied patches from `doc.subscribe()`.
- Keep lost-bookmark state extension-local.

## Non-goals

- Browser bookmarks, route state, target picker UI, persistence, focus sync, and
  stable record identity.

## Friction report

- `trackPointer()` can keep stored Pointer references aligned with applied
  patch streams from `doc.subscribe()`.
- `doc.at()` is enough to validate bookmark targets before storing them.
- Cascading deletion becomes extension-local lost-bookmark state, not core
  selection or stable identity semantics.
- Bookmark names remain host or extension policy.
