# @zod-crud/bulk-edit

Headless JSONPath bulk replace/delete helpers for `zod-crud` documents.

Lab status: private prototype. Not an official package.

```ts
import { createBulkEdit } from "@zod-crud/bulk-edit";

const bulk = createBulkEdit(doc);

bulk.replaceQuery("$.items[*].done", true);
bulk.replaceQuery("$.items[*].title", ({ value }) => String(value).trim());
bulk.deleteQuery("$.items[?@.archived == true]");
```

Public API pressure/friction:

- `doc.query()` returns pointers only, so mapper replacements need `doc.at(pointer)` reads.
- Bulk JSONPath mutation needs extension-local planning because public document methods expose patch primitives, not a batch query command.
- Delete plans must sort deeper paths and later array indexes first to avoid pointer drift.
