# @zod-crud/fill-empty

Lab fill-empty extension for `zod-crud` documents.

Use it to fill only the empty slots across a list of targets (Sheets "fill
blanks", "set a default for missing values"), using only the public document
facade.

```ts
import { createFillEmpty } from "@zod-crud/fill-empty";

const f = createFillEmpty(doc);

// Fill blank notes, keep the ones already written.
f.fillEmpty(["/rows/0", "/rows/1", "/rows/2"], { value: "n/a" }, { field: "/note" });

// Custom emptiness, computed value.
f.fillEmpty(targets, { compute: (p) => `auto:${p}` }, { field: "/note", isEmpty: (v) => v == null });
```

## Scope

- Write a `field` (or whole item) on each target **only when the current value is
  empty**, leaving non-empty values untouched.
- Default emptiness: `null`, `undefined`, `""`, or `[]`; override with
  `options.isEmpty`.
- Constant `{ value }` or per-target `{ compute }`; atomic `doc.canPatch` preflight.
- Report `count`, `filled`, planned operations, and `selectionAfter`.
- Expose `canFillEmpty` beside `fillEmpty`.

## Non-goals

- Adding missing fields/keys (targets must resolve) — this fills existing empty
  slots, not absent ones.
- Choosing the targets — host passes the pointer list.
- Unconditional set across a selection — that is `@zod-crud/batch-set`.
- No plugin registration; no `zod-crud` internal imports.

## Friction report

The public facade is enough: read each target, fill where `isEmpty`, preflight
the batch with `doc.canPatch`, apply atomically. The distinction from `batch-set`
is the **conditional** write (preserve existing values), which is the "fill
blanks / default missing" data-cleanup case. Absent fields are out of scope
because `replace` needs an existing slot; adding missing keys stays host-owned.
