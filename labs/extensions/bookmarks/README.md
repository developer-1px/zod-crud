# @zod-crud/bookmarks

Headless bookmark tracking helpers for `zod-crud` documents.

Lab status: private prototype. Not an official package.

```ts
import { createBookmarks } from "@zod-crud/bookmarks";

const bookmarks = createBookmarks(doc, {
  focusedTitle: "/items/0/title",
});

doc.insert("/items/0", { id: "new", title: "New" });

bookmarks.pointerFor("focusedTitle");
```

Public API pressure/friction:

- `trackPointer()` can keep stored Pointer references aligned with applied
  patch streams from `doc.subscribe()`.
- `doc.at()` is enough to validate bookmark targets before storing them.
- Cascading deletion becomes extension-local lost-bookmark state, not core
  selection or stable identity semantics.
- Bookmark names, persistence, focus sync, target picker UI, and stable record
  identity remain host or extension concerns.
