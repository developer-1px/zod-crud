# @zod-crud/list-ops

Headless list and kanban movement helpers for `zod-crud` documents.

Lab status: private prototype. Not an official package.

```ts
import { createListOps } from "@zod-crud/list-ops";

const list = createListOps(doc);

list.moveUp("/columns/0/cards/2");
list.moveAfter("/columns/0/cards/0", "/columns/1/cards/0");
list.duplicateAfter("/columns/0/cards/0", {
  rekey: { fields: ["id"], strategy: "suffix" },
});
```

Friction:

- There is no single public array item locator, so the lab composes `parentPointer`, `lastSegmentIndex`, and `doc.at(parent)`.
- Before/after semantics require local same-array insertion planning before calling `doc.move(source, target)`.
- List-specific disabled states need an extension-local Result union.
