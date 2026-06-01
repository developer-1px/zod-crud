# @zod-crud/calculated-fields

Lab calculated field extension for `zod-crud` documents.

Use it to test whether formula-like derived values can stay outside core while
still using public reads, schema checks, and patch execution.

```ts
import { createCalculatedFields } from "@zod-crud/calculated-fields";

const computed = createCalculatedFields(doc, [
  {
    path: "/stats/total",
    compute: ({ value }) => value.items.length,
  },
]);

computed.sync();
```

## Scope

- Let host code define calculated field functions.
- Read current target values through `doc.at`.
- Validate computed values with `doc.schema.accepts`.
- Preflight replacement patches with `doc.canPatch`.
- Apply replacements with `doc.patch`.

## Non-goals

- No formula language, dependency graph, spreadsheet engine, toggle-value detection, or
  scheduler.
- No rendered formula editor, validation panel, keyboard, focus, or recalculation
  UI.
- No automatic background sync; hosts decide when to call `sync`.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Friction report

The public facade is enough for simple calculated fields. Host code owns formulas,
dependencies, and timing. The extension computes values, validates them with the
schema helper, and applies a normal replacement patch batch.

This keeps formula systems out of core while preserving schema-valid document
state.
