# @zod-crud/record-index

Official headless stable record identity extension for `zod-crud` documents.

Use it when UI state stores stable record ids but document edits address JSON
Pointers: focused rows, selected cards, slide blocks, layer items, admin
sections, or spreadsheet tabs.

```ts
import { createRecordIndex } from "@zod-crud/record-index";

const cards = createRecordIndex(doc, {
  query: "$.cards[*]",
  key: "id",
});

const pointer = cards.pointerFor("todo");
cards.replace("todo", { id: "todo", title: "Todo", done: true });
```

## Scope

- Build a stable key-to-pointer index from a JSONPath query.
- Refresh pointers when document structure changes.
- Read records by key.
- Replace records by key through public `canReplace` and `replace`.
- Report duplicate-key policy explicitly.
- Notify subscribers only when the index snapshot changes.

## Non-goals

- No UI, DOM focus, virtual row model, keyboard, or selection ownership.
- No schema-specific id convention beyond the configured key field.
- No product words such as card, row, slide, layer, section, or tab in the API.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Contract

`@zod-crud/record-index` delegates to the public `zod-crud` facade:
`canFind`, `query`, `at`, `canReplace`, `replace`, and `subscribe`.

Core remains pointer-based. Stable identity is an extension concern layered on
top of JSONPath plus object key fields.
