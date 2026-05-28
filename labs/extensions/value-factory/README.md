# @zod-crud/value-factory

Lab value factory extension for `zod-crud` documents.

Use it to test whether new card/block/row defaults can stay outside core while
still being checked against the public schema and document capability surface.

```ts
import { createValueFactory } from "@zod-crud/value-factory";

const values = createValueFactory(doc, (context) => {
  if (context.path === "/cards/-") {
    return { id: crypto.randomUUID(), title: "", done: false };
  }
  return undefined;
});

values.insert("/cards/-");
```

## Scope

- Ask host code for a value at a Pointer/schema slot.
- Validate the value with `doc.schema.accepts`.
- Preflight insertion with `doc.canInsert`.
- Insert the value with `doc.insert`.
- Expose `can*` methods beside mutating methods.

## Non-goals

- No built-in ID, slug, timestamp, default text, or product template policy.
- No rendered create form, dialog, command palette, keyboard, or focus policy.
- No Zod schema object exposure; factories receive public schema descriptions.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Friction report

The public facade is enough for host-owned value creation: inspect the target
with `doc.schema.describe`, ask host code for a candidate, validate through
`doc.schema.accepts`, then preflight and execute through `canInsert`/`insert`.

This intentionally does not infer valid defaults from every possible Zod
schema. Product defaults, IDs, and template choices are host policy. The useful
core contract is the schema slot check, not a universal default generator.
