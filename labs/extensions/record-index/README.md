# @zod-crud/record-index

Lab extension for building a keyed index over JSONPath results.

```ts
const cards = createRecordIndex(doc, {
  query: "$.cards[*]",
  key: "id",
});

cards.replace("todo", { id: "todo", title: "Todo", done: true });
```

## Status

Private lab package. Not part of the official public API.

## Public API Pressure

- Uses only `doc.canFind`, `doc.query`, `doc.at`, `doc.canReplace`, `doc.replace`, and `doc.subscribe`.
- Stable identity can be layered outside core, but it has to rebuild pointers from query results.
- Duplicate-key policy belongs in the extension, not core.

## Friction

- `doc.query()` returns pointers only, so every indexed record needs a follow-up `doc.at()`.
- There is no public identity/locator primitive. That is acceptable for now, but row focus and selection sync will keep pressuring this area.
