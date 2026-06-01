# @zod-crud/set-membership

Lab set-membership extension for `zod-crud` documents.

Use it to treat a JSON array as a set: toggle, add, or remove a value's presence
(tag toggles, multi-select chips), using only the public document facade.

```ts
import { createSetMembership } from "@zod-crud/set-membership";

const m = createSetMembership(doc);

m.toggle("/tags", "urgent");                 // add if absent, remove if present
m.add("/tags", "urgent");                    // ensure present
m.remove("/tags", "urgent");                 // ensure absent
m.toggle("/refs", { id: "x" }, { keyOf: (r) => r.id }); // object membership
```

## Scope

- `toggle` / `add` / `remove` a value's membership in an array.
- Equality is whole-value JSON by default; `options.keyOf` for object members.
- `remove`/`toggle`-off drops all occurrences; `add` appends once.
- Report `present` (after), `action` (`added`/`removed`/`none`), and planned
  operations; preflight with `doc.canPatch`.
- Expose `canToggle` beside the mutators.

## Non-goals

- Ordered insertion position (appends at the end) — sort with
  `@zod-crud/collection-sort` if order matters.
- Deduping an existing array — that is `@zod-crud/dedupe`.
- No plugin registration; no `zod-crud` internal imports.

## Friction report

The public facade is enough: detect presence by key, compute the next array,
preflight with `doc.canPatch`, apply. This is the tag/label/multi-select toggle
that recurs across pickers — distinct from `cycle` (single field value),
`batch-set` (field set across items), and `dedupe` (collapse duplicates). Object
membership relies on a host `keyOf`, the same boundary `dedupe` uses.
