# zod-crud LLM Guide

Use this file as the compact project map for code generation, reviews, and
debugging.

## Package Identity

`zod-crud` is a headless JSON document editing core guarded by a Zod root schema.
It is not a React component, form library, JSON Schema renderer, persistence
layer, or visual treegrid. Consumers bring UI and storage; this package owns
document mutation semantics.

Main package: `packages/zod-crud`

Source of truth:

- Behavior contract: `packages/zod-crud/spec.md`
- Public exports: `packages/zod-crud/src/index.ts`
- Public README: `packages/zod-crud/README.md`
- Runtime facade: `packages/zod-crud/src/json-crud.ts`

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

## Public API

Import from the package root only:

```ts
import { createJsonCrud, serialize, deserialize, getPath } from "zod-crud";
import type { JsonCrud, JsonDoc, JsonValue, OperationResult } from "zod-crud";
```

The package is ESM-only. Do not generate `require("zod-crud")` examples.

Main editor methods:

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

- Do not mutate `crud.snapshot()` and expect the editor to update. Snapshots are
  cloned read models.
- Do not store array indexes as durable selection state. Use `NodeId`; array
  keys normalize after insert/delete.
- Do not bypass operations by editing `JsonDoc.nodes` directly.
- Do not assume Zod coercion means mutation coercion. A value like `"5"` is not
  accepted for `z.coerce.number()` if stored JSON would remain a string.
- Do not overwrite `OperationResult.focusNodeId`; editor UIs should follow it
  after successful mutations.
- Do not add exports without updating `src/index.ts`, package README, smoke
  tests, and this file.

## Test Commands

```sh
npm run typecheck -w zod-crud
npm test -w zod-crud
npm run build -w zod-crud
npm run smoke:package -w zod-crud
npm run verify
```
