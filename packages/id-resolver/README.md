# @zod-crud/id-resolver

Official headless stable id resolver extension for `zod-crud` documents.

Use it when a product stores stable ids in JSON nodes and commands need the
current JSON Pointer: kanban cards, form fields, slide objects, diagram nodes,
review comments, layer panels, or imported rows.

```ts
import { createIdResolver } from "@zod-crud/id-resolver";

const ids = createIdResolver(doc, {
  scopes: [
    {
      scope: "card",
      query: "$.columns[*].cards[*]",
      readId: (value) => isCard(value) ? value.id : undefined,
    },
  ],
});

ids.resolve("card", "card-1");
ids.current();
```

## Scope

- Resolve a registered `scope` and stable `id` to the current JSON Pointer.
- Re-read the public `zod-crud` document on each call, so moved nodes resolve to
  their latest pointer.
- Report duplicate ids, invalid queries, unreadable pointers, and invalid id
  values with structured diagnostics.
- Keep scope names independent, so `card:1` and `column:1` do not collide.

## Non-goals

- No id generation, id rekeying, uniqueness repair, or server identity policy.
- No references, backlinks, relation graph, comment anchors, selection, focus,
  routing, or UI ownership.
- No caching, subscriptions, indexes, persistence, or remote sync.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Contract

`@zod-crud/id-resolver` accepts public `JSONDocument` plus scope descriptors. A
scope descriptor owns the JSONPath query and the `readId(value, pointer)`
function. The extension delegates all reads to the public `doc.query` and
`doc.at` facade and never mutates the document.

If the same id appears more than once in one scope, `resolve(scope, id)` returns
`ambiguous_id` with every matching pointer. If a value has no id, return
`undefined` from `readId` to skip it.
