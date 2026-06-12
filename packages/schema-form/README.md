# @interactive-os/json-document-schema-form

Official headless schema-backed field descriptor extension for `@interactive-os/json-document`
documents.

Use it when a product needs to render or inspect editable fields without
putting UI policy in core: settings forms, generated admin resource forms,
document property panels, slide metadata panels, or spreadsheet tab settings.

```ts
import { createSchemaForm, createSchemaFormTree } from "@interactive-os/json-document-schema-form";

const form = createSchemaForm(doc, "/settings");

if (form.ok) {
  const title = form.fields.find((field) => field.key === "title");
  title?.set("Published");
}

const tree = createSchemaFormTree(doc, "/page");
```

## Scope

- Describe object, record, and array entries as field descriptors.
- Read each field's key, Pointer path, current value, and schema kind.
- Describe nested editable field trees without host-owned Pointer traversal.
- Expose `canSet(value)` and `set(value)` per field.
- Use document replacement capability as the source of truth for `canSet`, so
  current discriminated-union branch fields work without app-owned Zod branch
  introspection.

## Non-goals

- No rendered inputs, labels, layout, validation UI, focus, or keyboard policy.
- No registry of field widgets.
- No stale descriptor tracking. Recreate the form after document changes.
- No collection movement; use `@interactive-os/json-document-collection`.
- No stable identity lookup; host code owns id-to-pointer policy when needed.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `@interactive-os/json-document` internal imports.

## Contract

`@interactive-os/json-document-schema-form` delegates to the public `@interactive-os/json-document` facade:
`entries`, `schema.kind`, `schema.accepts`, `canReplace`, and `replace`.

Core remains an editing engine. Field rendering and product-specific form policy
stay in the host.
