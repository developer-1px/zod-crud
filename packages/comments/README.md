# @zod-crud/comments

Official headless comments extension for review notes anchored to `zod-crud`
documents.

Use it when a product needs review comments anchored to JSON structure: block documents,
CMS review, slide/object notes, import review, moderation queues, or generated admin editors.

```ts
import { createComments } from "@zod-crud/comments";

const comments = createComments(doc);

comments.add({
  id: "review-title",
  pointer: "/title",
  text: "Needs a clearer title",
});

comments.resolve("review-title");
```

## Scope

- Validate anchors with `doc.at(pointer)` before storing them.
- Track anchors through document edits with `doc.subscribe(...)` and
  `trackPointer(...)`.
- Confirm tracked anchors still address live state with `doc.exists(pointer)`.
- Add, update, resolve, reopen, remove, filter, and subscribe to in-memory
  comments without mutating the document.
- Mark removed anchors as lost with `pointer: null`.

## Non-goals

- No rendered comment UI, thread layout, popovers, highlighting, keyboard, or
  focus policy.
- No author identity, moderation policy, collaboration transport, persistence,
  server sync, or permissions.
- No automatic lost-anchor recovery. Recovery is product policy.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Contract

`@zod-crud/comments` keeps comment state outside the core document while tracking
anchors through public patch subscriptions. A removed anchor becomes a lost
comment; the host decides whether to restore, discard, or show it.
