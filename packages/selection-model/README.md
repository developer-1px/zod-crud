# @zod-crud/selection-model

Official headless pointer selection model extension for `zod-crud` documents.

Use it when a product needs app-level selection snapshots over JSON Pointers:
selected kanban cards, outliner rows, slide blocks, admin sections, layer
items, or spreadsheet tabs.

```ts
import { createSelectionModel } from "@zod-crud/selection-model";

const selection = createSelectionModel(doc);

selection.selectMany(["/cards/0", "/cards/1"]);
const selectedValues = selection.current().ok
  ? selection.current().values
  : [];
```

## Scope

- Read selected pointers, primary pointer, values, and the underlying
  `SelectionSnap`.
- Select one pointer, select many pointers, toggle one pointer, and clear.
- Expose `can*` methods for selection changes.
- Subscribe to document selection changes.

## Non-goals

- No DOM focus, keyboard policy, range rendering, row virtualization, or UI.
- Stable identity lookup; use `@zod-crud/record-index` for id-to-pointer.
- No collection movement; use `@zod-crud/collection`.
- No clipboard/delete command catalog. Hosts can pass `snapshot.pointers` to
  core `copy`, `cut`, or `delete` when they need those commands.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Contract

`@zod-crud/selection-model` delegates to public `zod-crud` only:
`doc.selection`, `doc.at`, and selection facade methods.

Core remains pointer-based. This extension is a projection layer for apps that
need current selected values and disabled reasons without owning selection
snapshot plumbing in every surface.
