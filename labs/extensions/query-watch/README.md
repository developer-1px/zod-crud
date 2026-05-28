# @zod-crud/query-watch

Reactive JSONPath projection helpers for `zod-crud` documents.

Lab status: private prototype. Not an official package.

```ts
import { createQueryWatch } from "@zod-crud/query-watch";

const watch = createQueryWatch(doc, "$.items[*].title");
const stop = watch.subscribe((snapshot) => {
  if (snapshot.ok) snapshot.matches;
});
```

Friction:

- `doc.query()` returns pointers only, so value projection needs a second `doc.at(pointer)` pass.
- `doc.canFind()` validates JSONPath, but the extension still owns query/read state shape.
