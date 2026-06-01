# @zod-crud/limit

Lab limit extension for `zod-crud` documents.

Use it to cap a JSON array to at most `max` items (recent-items lists, history
rotation, "keep latest N"), using only the public document facade.

```ts
import { createLimit } from "@zod-crud/limit";

const l = createLimit(doc);

l.limit("/recent", 10);                 // keep the first 10
l.limit("/recent", 10, { from: "end" }); // keep the last 10
```

## Scope

- Trim an array to at most `max` items, keeping the start (default) or the end.
- A `max` >= the current length is a no-op; `max` 0 empties the array.
- Schema array bounds are enforced by `doc.canPatch` (a `max` below `minItems`
  is rejected); return `removed`, the kept `values`, and planned operations.
- Expose `canLimit` beside `limit`.

## Non-goals

- Choosing which items survive beyond start/end (sort first with
  `@zod-crud/collection-sort`).
- Auto-trimming on insert (host policy / a subscriber).
- No plugin registration; no `zod-crud` internal imports.

## Friction report

The public facade is enough: read the array, slice, preflight the replacement
with `doc.canPatch`, apply. Common as the "keep latest N" cap on recents/history
arrays. Pairs naturally with an insert + limit step a host runs after appending;
the lab keeps the trim explicit rather than hooking insert events.
