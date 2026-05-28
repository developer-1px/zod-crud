# @zod-crud/dirty-state

Headless dirty state helpers for `zod-crud` documents.

Lab status: private prototype. Not an official package.

```ts
import { createDirtyState } from "@zod-crud/dirty-state";

const dirty = createDirtyState(doc);

dirty.isDirty();
dirty.markClean();
dirty.discard({ preserveHistory: true });
```

Friction:

- The extension can observe document changes through `doc.subscribe`, but selection state remains outside the dirty baseline unless a caller includes it separately.
- `discard` can thread `preserveHistory` into `doc.load`, but history semantics stay a core document concern.
- Default comparison uses `JSON.stringify`, so callers with order-insensitive or ignored fields need a custom `equals` comparator.
