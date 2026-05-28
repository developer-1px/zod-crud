# @zod-crud/collection

Official headless collection editing extension for `zod-crud` documents.

Use it when a product has ordered JSON arrays: kanban columns, outliner rows,
slide rails, layer lists, admin tree sections, or spreadsheet tabs.

```ts
import { createCollection } from "@zod-crud/collection";

const collection = createCollection(doc);

collection.moveUp("/columns/0/cards/2");
collection.moveAfter("/columns/0/cards/0", "/columns/1/cards/0");
collection.duplicateAfter("/slides/0", {
  rekey: { fields: ["id"], strategy: "suffix" },
});
collection.deleteItems(["/tabs/1", "/tabs/3"]);
```

## Scope

- Move collection items up or down.
- Move one item before or after another item, including across arrays.
- Duplicate an item after itself with optional `zod-crud` rekeying.
- Delete one or more collection item pointers as a single document change.
- Expose `can*` methods beside every edit method.

## Non-goals

- No UI, DOM, drag-and-drop, focus, keyboard, or command palette ownership.
- No product words such as kanban, slide, layer, row, or tab in the API.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Contract

`@zod-crud/collection` accepts only RFC 6901 JSON Pointers that address array
items. It delegates actual document mutation to the public `zod-crud` facade:
`canMove`, `move`, `canDuplicate`, `duplicate`, `canDelete`, and `delete`.

Invalid pointers, root pointers, object properties, and movement boundaries
return structured extension errors without mutating the document.
