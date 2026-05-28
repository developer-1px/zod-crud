# @zod-crud/dirty-state

Official headless dirty state tracking extension for `zod-crud` documents.

Use it when a product needs to compare the current document against a clean
baseline without owning document diff plumbing: draft editors, document
workbenches, generated admin forms, slide editors, spreadsheet tabs, or CMS
resource editors.

```ts
import { createDirtyState } from "@zod-crud/dirty-state";

const dirty = createDirtyState(doc);

dirty.isDirty();
dirty.markClean();
dirty.discard({ preserveHistory: true });
```

## Scope

- Capture the initial document value as the clean baseline.
- Report the current dirty flag with cloned current and baseline values.
- Mark the current document value as clean.
- Discard document changes back to the clean baseline through `doc.load`.
- Subscribe to dirty snapshot changes.
- Accept a custom equality comparator when JSON signature comparison is too
  strict.

## Non-goals

- No storage, save button, autosave, sync, conflict resolution, or UI policy.
- No form rendering, focus, keyboard, or route lifecycle ownership.
- No history serialization. `discard({ preserveHistory: true })` only threads
  through the public `doc.load` option.
- No selection baseline tracking; compose with `doc.selection` or
  `@zod-crud/selection-model` when a product needs selection-aware state.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Contract

`@zod-crud/dirty-state` delegates to the public `zod-crud` facade:
`value`, `load`, and `subscribe`.

Core remains the owner of document mutation and history behavior. This
extension owns clean-baseline comparison and dirty snapshot notification.
