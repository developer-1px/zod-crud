# @zod-crud/active-pointer

Lab active pointer extension for `zod-crud` documents.

Use it to test whether focused row/card/block state can stay outside core while
remaining JSON Pointer based and independent from DOM focus.

```ts
import { createActivePointer } from "@zod-crud/active-pointer";

const active = createActivePointer(doc, "/cards/0");

active.set("/cards/1");
active.current();
```

## Scope

- Store one active JSON Pointer.
- Validate active targets through `doc.at`.
- Track the active pointer across applied patch streams.
- Optionally recover deleted array items to next sibling, previous sibling, or
  nearest surviving parent.
- Read the active value without exposing mutable document state.

## Non-goals

- No DOM focus, roving tabindex, keyboard policy, scroll policy, or visual
  highlight UI.
- No multi-selection model; use core selection or selection-model separately.
- No stable id lookup; use record-index separately.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Friction report

The public facade is enough for active item state: `trackPointer` handles normal
patch movement, `doc.at` validates targets, and `doc.exists` lets the extension
own fallback policy when an active item is deleted.

This lab keeps DOM focus out of core. If a UI needs focus restoration, it can map
the active Pointer to rendered elements in the host layer.
