# @zod-crud/persist-web

Prototype web persistence helpers for `zod-crud` documents.

Lab status: private prototype. Not an official package.

```ts
import { createDocumentPersistence } from "@zod-crud/persist-web";

const persistence = createDocumentPersistence(doc, { key: "draft" });

await persistence.save();
await persistence.restore({ preserveHistory: true, restoreSelection: true });
const stop = persistence.watch();
await persistence.clear();
stop();
```

Friction:

- `doc.load()` can throw in strict mode, so this lab catches the public `JSONCrudError` export to keep restore result-shaped.
- History internals are intentionally not serializable. This lab can preserve the current undo stack during restore, but cannot restore history across sessions.
- Selection restore only works when document selection is enabled.
