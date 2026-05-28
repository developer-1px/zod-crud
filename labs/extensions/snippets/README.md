# @zod-crud/snippets

Lab snippet insertion extension for `zod-crud` documents.

Use it to keep reusable block/card/template insertion outside core while still
using schema-safe public paste checks.

```ts
import { createSnippets } from "@zod-crud/snippets";

const snippets = createSnippets(doc, [
  {
    id: "todo-card",
    label: "Todo card",
    payload: { id: "todo", title: "New card", done: false },
  },
]);

snippets.insert("todo-card", "/cards/-", {
  rekey: { fields: ["id"], strategy: "suffix" },
});
```

## Scope

- Keep a small headless snippet catalog.
- Insert a snippet payload with `canPaste` / `paste`.
- Allow per-snippet and per-call paste options such as `rekey` and `spread`.
- Preserve disabled reasons from core capability checks.

## Non-goals

- No slash command UI, palette, menu, editor toolbar, or search ranking.
- No block renderer, native file import, markdown parser, or formula engine.
- No id generation policy beyond public paste `rekey` options; host code may
  build the payload before passing it to this package.
- No snippet persistence or sharing protocol.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Friction report

The public facade is enough for snippets when a snippet is understood as a
reusable JSON payload. Core does not need a template registry. Product-specific
palette UX, dynamic id factories, and format-specific parsing stay outside this
package; the final payload enters through direct payload paste.
