# zod-crud LLM Guide

This package is a headless JSON CRUD core guarded by a Zod root schema. It is
not a React component, form library, JSON Schema renderer, persistence layer,
or visual treegrid.

Source of truth:

- Behavior contract: `spec.md`
- Public exports: `src/index.ts`
- Runtime facade: `src/json-crud.ts`
- Runtime implementation: `src/json-crud-instance.ts`
- Public usage guide: `README.md`

## Mental Model

```txt
nested JSON
  -> createJsonCrud(schema, initial)
  -> serialize into flat JsonDoc nodes
  -> mutate by NodeId
  -> validate full document against root schema
  -> commit or reject atomically
```

Every JSON value is a node. Object fields, array items, primitives, and the root
all have `NodeId`s. UI state should prefer `NodeId` over long-lived JSON paths.

The long-term core model is a serializable operation engine:

```txt
schema + initial JSON
  -> createJsonCrudState(schema, initial)
  -> JSON-compatible JsonCrudState
  -> dispatchJsonCrudCommand(state, command, context)
  -> JSON-compatible commands / events / history
```

Do not put Zod schemas, callbacks, subscribers, `Map`, `Set`, class instances,
or closures into `JsonCrudState`. Runtime dependencies belong in context,
React hooks, or compatibility facades.

## Public API

Import from the package root only:

```ts
import { createJsonCrud, createJsonCrudState, dispatchJsonCrudCommand, serialize, deserialize, getPath } from "zod-crud";
import type { JsonCrud, JsonCrudState, JsonDoc, JsonValue, OperationResult } from "zod-crud";
```

The package is ESM-only. Do not generate `require("zod-crud")` examples.

Main `JsonCrud` methods:

- Read: `snapshot`, `toJson`, `read`, `pathOf`, `find`
- Mutate: `create`, `insertBefore`, `insertAfter`, `appendChild`, `update`,
  `rename`, `delete`, `deleteMany`
- Clipboard: `copy`, `copyMany`, `cut`, `cutMany`, `paste`
- Capability checks: `canCopyMany`, `canCutMany`, `canDeleteMany`, `canPaste`,
  `canUndo`, `canRedo`
- History: `undo`, `redo`
- Store bridge: `subscribe`

## Invariants To Preserve

- Every committed document must pass the root Zod schema.
- Zod parsed output must be JSON-identical to stored JSON. Coercion, stripping,
  transforms, or defaults that would change an already-stored candidate are
  rejected.
- Failed operations must not mutate document state, undo/redo stacks,
  clipboard, or id allocation.
- Successful mutating operations push exactly one undo snapshot and clear redo.
- `canPaste` and other capability checks are dry runs.
- Public mutation methods return `OperationResult`; expected invalid input
  should not throw.
- `copy` and read-only helpers may throw for invalid ids or malformed docs.

## Correct Usage Pattern

```ts
import * as z from "zod";
import { createJsonCrud } from "zod-crud";

const Schema = z.object({
  title: z.string(),
  tags: z.array(z.string()),
});

const crud = createJsonCrud(Schema, { title: "Draft", tags: [] });
const rootId = crud.snapshot().rootId;
const tagsId = crud.find(rootId, "tags");

const result = crud.create(tagsId!, 0, "docs");
if (!result.ok) {
  console.error(result.reason);
}

console.log(crud.toJson());
```

## Common Mistakes

- Do not mutate `crud.snapshot()` and expect `crud` to update. Snapshots are
  cloned read models.
- Do not store array indexes as durable selection state. Use `NodeId`; array
  keys normalize after insert/delete.
- Do not bypass operations by editing `JsonDoc.nodes` directly.
- Do not assume Zod coercion means mutation coercion. A value like `"5"` is not
  accepted for `z.coerce.number()` if stored JSON would remain a string.
- Do not overwrite `OperationResult.focusNodeId`; editor UIs should follow it
  after successful mutations.
- Do not add exports without updating `src/index.ts`, README, smoke tests, and
  this file.
- Do not deep-import implementation modules such as `src/json-crud-instance.ts`,
  `src/crud/*`, `src/clipboard/*`, `src/selection/*`, `src/history/*`, or
  `src/schema/*`. They are internal to the package facade.
