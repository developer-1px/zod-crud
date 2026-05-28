# @zod-crud/patch-preview

Headless patch preview helpers for `zod-crud` documents.

Lab status: private prototype. Not an official package.

```ts
import { createPatchPreview } from "@zod-crud/patch-preview";

const previewer = createPatchPreview(Schema, doc);
const preview = previewer.preview([
  { op: "replace", path: "/title", value: "Next" },
]);

if (preview.ok) {
  preview.value;
}
```

Public API pressure/friction:

- `doc.canPatch()` already gives mutation preflight and disabled reasons.
- Public root `applyPatch()` can compute a dry-run next value without document
  mutation when the host passes the same schema it used to create the document.
- The document facade intentionally does not expose the root Zod schema, so this
  lab requires the host-owned schema at creation time.
- Diffs, confirmation UI, command labels, save prompts, and patch authoring
  remain host concerns.
