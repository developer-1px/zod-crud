# @zod-crud/schema-form

Headless schema-driven field descriptors for `zod-crud` documents.

Lab status: private prototype. Not an official package.

```ts
import { createSchemaForm } from "@zod-crud/schema-form";

const form = createSchemaForm(doc, "/settings");

if (form.ok) {
  const title = form.fields.find((field) => field.key === "title");
  title?.set("Published");
}
```

Friction:

- `doc.entries("")` reports root as `root`, so root forms also need `doc.schema.kind("")` to classify object or array roots.
- Field descriptors need both schema and document capability checks: `schema.accepts()` gives field validation, while `canReplace()` catches patchability.
- The extension can describe current fields, but stale descriptors are not reactive; callers recreate the form after document changes.
