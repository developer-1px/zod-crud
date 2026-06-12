# @interactive-os/json-document-patch-preview

Official headless patch preview extension for `@interactive-os/json-document` documents.

Use it when a product needs to preview schema-safe JSON Patch changes before
applying them: import review, find/replace confirmation, AI proposed changes,
bulk cleanup, dry-run save checks, or admin moderation.

```ts
import { createPatchPreview } from "@interactive-os/json-document-patch-preview";

const previewer = createPatchPreview(Schema, doc);
const preview = previewer.preview([
  { op: "replace", path: "/title", value: "Next" },
]);

if (preview.ok) {
  preview.value;
  preview.applied;
}
```

## Scope

- Preflight operations with `doc.canPatch(...)`.
- Compute a next JSON document value without mutating the document.
- Return normalized applied operations, including resolved array append paths.
- Preserve the public capability failure or patch failure when preview is not
  possible.
- Support an optional trusted-state path for hosts that already own the schema
  boundary.

## Non-goals

- No visual diff rendering, confirmation UI, review workflow, author metadata,
  storage, approval policy, or undo/redo ownership.
- No schema discovery from the document facade. The host passes the same schema
  it used to create the document.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `@interactive-os/json-document` internal imports.

## Contract

`@interactive-os/json-document-patch-preview` accepts a public `JSONDocument`, a Zod schema, and a
JSON Patch operation array. It delegates capability checks to `doc.canPatch`
and dry-run application to public root helpers: `applyPatch` or
`applyPatchToTrustedState`.

The returned `value` and `applied` operations are cloned. Mutating a preview
result never mutates the document.
