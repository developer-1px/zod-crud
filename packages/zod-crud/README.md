# zod-crud

Flat JSON CRUD, clipboard, and history primitives guarded by Zod schemas.

The behavior contract lives in [`spec.md`](./spec.md). Treat it as the SSOT for
operation semantics, Zod compatibility, and package readiness checks.

The core idea is simple:

```txt
nested JSON
  -> serialize()
flat node table
  -> CRUD / copy / paste / undo / redo
  -> deserialize()
nested JSON
```

Zod is used as the structural policy layer. A mutation is committed only when
the target subtree matches the Zod schema at that JSON path.

## Model

Every JSON value becomes one flat node:

```ts
type JsonDoc = {
  rootId: string;
  nodes: Record<string, JsonNode>;
};

type JsonNode = {
  id: string;
  type: "object" | "array" | "string" | "number" | "boolean" | "null";
  parentId: string | null;
  key: string | number | null;
  children: string[];
  value?: string | number | boolean | null;
};
```

`key` is unified:

- object child: field name
- array child: numeric index
- root: `null`

## Usage

`zod-crud` is ESM-only. Use `import` from Node ESM, TypeScript, or a bundler.

```ts
import * as z from "zod";
import { createJsonCrud } from "zod-crud";

type UiNode =
  | { kind: "frame"; name: string; children: UiNode[] }
  | { kind: "text"; text: string };

const UiNodeSchema: z.ZodType<UiNode> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal("frame"),
      name: z.string(),
      children: z.array(UiNodeSchema),
    }),
    z.object({
      kind: z.literal("text"),
      text: z.string(),
    }),
  ]),
);

const editor = createJsonCrud(UiNodeSchema, {
  kind: "frame",
  name: "root",
  children: [{ kind: "text", text: "hello" }],
});

const rootId = editor.snapshot().rootId;
const childrenId = editor.find(rootId, "children");
const textNodeId = editor.find(childrenId!, 0);

editor.copy(textNodeId!);
const pasteResult = editor.paste(rootId); // inserts into root.children if the item schema accepts it

if (pasteResult.ok) {
  console.log(pasteResult.focusNodeId); // root id of the pasted subtree
  console.log(pasteResult.changes); // changed JsonDoc nodes only
}

editor.undo();
const redoResult = editor.redo();

if (redoResult.ok) {
  console.log(redoResult.focusNodeId); // node an editor should focus
  console.log(redoResult.changes); // inserts, updates, and deletes from core
}

const json = editor.toJson();
```

## Current Scope

- `serialize()` / `deserialize()`
- flat JSON node table
- `create`, `update`, `rename`, `delete`, `deleteMany`
- `copy`, `copyMany`, `cut`, `cutMany`, `paste`
- `canCopyMany`, `canCutMany`, `canDeleteMany`, `canPaste`
- `undo`, `redo`
- `OperationResult.changes` for changed `JsonDoc` nodes from the operation delta
- `OperationResult.focusNodeIds` for batch-created focus targets
- recursive Zod object/array/union path validation
- `children` convention for child paste, configurable via `childKeys`
