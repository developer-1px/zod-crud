# @zod-crud/bulk-edit

Official headless JSONPath bulk editing extension for `zod-crud` documents.

Use it when a product needs command-grade "replace all" or "delete all matches"
behavior without putting query mutation commands in core: find/replace panels,
batch cleanup tools, generated admin actions, CMS moderation queues, spreadsheet
normalizers, or kanban maintenance commands.

```ts
import { createBulkEdit } from "@zod-crud/bulk-edit";

const bulk = createBulkEdit(doc);

bulk.replaceAll("$.items[*].done", true);
bulk.replaceAll("$.items[*].title", ({ value }) => String(value).trim());
bulk.deleteAll("$.items[?@.archived == true]");
```

## Scope

- Resolve JSONPath matches to unique JSON Pointers.
- Read current matched values for mapper-based replacements.
- Expose `canReplaceAll` / `replaceAll`.
- Expose `canDeleteAll` / `deleteAll`.
- Return the applied Pointer list and JSON Patch operations.
- Sort delete operations so nested paths and later array indexes are patched
  before earlier containers.

## Non-goals

- No search panel, replace dialog, confirmation UI, selection UI, or keyboard
  policy.
- No product-specific command names.
- No persistence, audit log, or undo label policy.
- No stable identity lookup; host code owns id-to-pointer policy when needed.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Contract

`@zod-crud/bulk-edit` delegates to the public `zod-crud` facade:
`canFind`, `query`, `at`, `canPatch`, and `patch`.

Core remains the owner of JSONPath search and JSON Patch execution. This
extension owns query-match batching and replace-all/delete-all command shaping.
