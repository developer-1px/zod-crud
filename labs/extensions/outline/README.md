# @zod-crud/outline

Headless outline helpers for `zod-crud` documents.

Lab status: private prototype. Not an official package.

```ts
import { createOutline } from "@zod-crud/outline";

const outline = createOutline(doc, "", { maxDepth: 2 });

if (outline.ok) {
  outline.nodes.map((node) => node.path);
}
```

Public API pressure/friction:

- `doc.entries()` already exposes child order and Pointer paths for object,
  array, and record containers.
- `doc.schema.kind()` can annotate each outline node without importing schema
  internals.
- Large documents need extension-local depth limiting because core correctly
  exposes read primitives, not product-specific tree virtualization.
- Outline labels, icons, expansion state, focus, selection, and drag/drop remain
  host UI concerns.
