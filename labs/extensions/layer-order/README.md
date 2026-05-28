# @zod-crud/layer-order

Lab layer ordering extension for `zod-crud` documents.

Use it to implement drawing and presentation commands such as bring forward,
bring to front, send backward, and send to back when a JSON array represents
visual stack order.

```ts
import { createLayerOrder } from "@zod-crud/layer-order";

const layers = createLayerOrder(doc);

layers.bringForward("/slides/0/blocks/1");
layers.bringToFront(["/slides/0/blocks/0", "/slides/0/blocks/2"]);
```

## Scope

- Reorder one or more sibling array items as layer stack commands.
- Treat the end of the array as the front of the stack.
- Preserve selected item relative order.
- Validate the final reordered array with `canPatch` before `patch`.

## Non-goals

- No canvas geometry, alignment, distribute, snap, handles, or hit testing.
- No DOM focus, keyboard shortcuts, toolbar command registry, or selection UI.
- No stable id lookup; host code translates selected ids to JSON Pointers.
- No nested group pruning; host code decides which selected pointers are active.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Friction report

The public facade is enough for layer ordering. The extension reads sibling
array items with `doc.at`, computes a reordered array, checks it with
`doc.canPatch`, and commits with `doc.patch`. A narrower `doc.move` sequence
could preserve more granular patch records, but multi-selection layer commands
are already expressible without adding a core `reorder` primitive.
