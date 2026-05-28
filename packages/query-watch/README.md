# @zod-crud/query-watch

Official headless JSONPath projection subscription extension for `zod-crud`
documents.

Use it when a product needs derived read models without owning query plumbing:
inspectors, filtered side panels, search result lists, preview summaries,
validation panels, or generated admin dashboards.

```ts
import { createQueryWatch } from "@zod-crud/query-watch";

const watch = createQueryWatch(doc, "$.items[*].title");
const stop = watch.subscribe((snapshot) => {
  if (snapshot.ok) snapshot.matches;
});
```

## Scope

- Read a JSONPath projection as pointers, values, and path/value matches.
- Subscribe to document changes and notify only when the projection snapshot
  changes.
- Expose manual `refresh()`.
- Report JSONPath syntax, query, and read errors as structured snapshots.

## Non-goals

- No UI, rendering, filters panel, search box, virtual list, or data grid.
- No mutation helpers. Use core `replace`, `delete`, `move`, or official
  extensions for edits.
- No stable identity lookup; use `@zod-crud/record-index`.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Contract

`@zod-crud/query-watch` delegates to the public `zod-crud` facade:
`canFind`, `query`, `at`, and `subscribe`.

Core remains the owner of JSONPath search. This extension owns projection state
shape and change notification.
