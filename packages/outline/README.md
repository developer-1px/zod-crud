# @interactive-os/json-document-outline

Official headless outline tree and structure editing extension for `@interactive-os/json-document`
documents.

Use it when a product has nested outline rows: outliners, Markdown list editors,
document block trees, note outlines, or generated content review tools.

```ts
import { createOutline } from "@interactive-os/json-document-outline";

const outline = createOutline(doc);

outline.tree("", { maxDepth: 2 });
outline.demote("/children/1");
outline.promote("/children/0/children/1");
```

## Scope

- Build a pointer-first outline tree from public document reads.
- Demote one or more outline items under their previous sibling.
- Promote one or more outline items to their parent item's next sibling.
- Preserve trailing siblings during promote, matching common outliner behavior.
- Expose `can*` methods beside every edit method.

## Non-goals

- No Markdown parser, rich text formatting, renderer, DOM selection, focus,
  keyboard, or command palette ownership.
- No default row factory and no insert-sibling/insert-child policy; host code
  creates the value and decides edit-mode transitions.
- No product words such as note, block, bullet, heading, or list item in the API.
- No stable id lookup; host code translates selected ids to JSON Pointers.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `@interactive-os/json-document` internal imports.

## Contract

`@interactive-os/json-document-outline` assumes each outline item stores nested rows in a child array
field named `children` by default. Pass `childrenKey` when a product uses another
field name.

It delegates actual document mutation to the public `@interactive-os/json-document` facade:
`at`, `canPatch`, and `patch`. Invalid pointers, root promotion/demotion,
missing siblings, and rejected patches return structured extension errors
without mutating the document.
