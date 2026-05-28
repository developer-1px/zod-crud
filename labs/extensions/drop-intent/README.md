# @zod-crud/drop-intent

Lab drop intent extension for `zod-crud` documents.

Use it to test whether drag/drop behavior can stay outside core while still
using the public move and paste capability surface.

```ts
import { createDropIntent } from "@zod-crud/drop-intent";

const drop = createDropIntent(doc);

drop.perform({
  source: { kind: "move", pointer: "/cards/0" },
  target: { after: "/cards/1" },
});
drop.perform({
  source: { kind: "payload", value: card },
  target: "/cards/-",
});
```

## Scope

- Represent internal pointer moves and external payload drops.
- Map internal drops to `canMove` / `move`.
- Map payload drops to `canPaste` / `paste`.
- Preserve disabled reasons from core capability checks.
- Keep target conversion headless and Pointer based.

## Non-goals

- No DOM drag events, drag image, pointer capture, hover UI, keyboard policy, or
  focus policy.
- No rendered drop zones or product-specific target naming.
- No stable id lookup; host code owns id-to-pointer policy when needed.
- No collection-specific reorder policy beyond public JSON Pointer insertion
  targets.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Friction report

The public facade is enough for headless drop intent. Internal drops are moves;
external drops are direct payload pastes. The same `can*` result object can drive
drop affordances and disabled reasons.

DOM event decoding, hit testing, scrolling, visual insertion indicators, and
keyboard alternatives remain host concerns.
