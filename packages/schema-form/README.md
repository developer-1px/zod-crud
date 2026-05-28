# @zod-crud/schema-form

Official headless schema-backed field descriptor extension for `zod-crud`
documents.

Use it when a product needs to render or inspect editable fields without
putting UI policy in core: settings forms, generated admin resource forms,
document property panels, slide metadata panels, or spreadsheet tab settings.

```ts
import { createSchemaForm } from "@zod-crud/schema-form";

const form = createSchemaForm(doc, "/settings");

if (form.ok) {
  const title = form.fields.find((field) => field.key === "title");
  title?.set("Published");
}
```

## Scope

- Describe object, record, and array entries as field descriptors.
- Read each field's key, Pointer path, current value, and schema kind.
- Expose `canSet(value)` and `set(value)` per field.
- Check both schema acceptance and document replacement capability before
  reporting that a field can be set.

## Non-goals

- No rendered inputs, labels, layout, validation UI, focus, or keyboard policy.
- No registry of field widgets.
- No stale descriptor tracking. Recreate the form after document changes.
- No collection movement; use `@zod-crud/collection`.
- No stable identity lookup; use `@zod-crud/record-index`.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Contract

`@zod-crud/schema-form` delegates to the public `zod-crud` facade:
`entries`, `schema.kind`, `schema.accepts`, `canReplace`, and `replace`.

Core remains an editing engine. Field rendering and product-specific form policy
stay in the host.
