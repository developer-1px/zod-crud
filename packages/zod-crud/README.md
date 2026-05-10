# zod-crud

Flat JSON CRUD, clipboard, and history primitives guarded by Zod schemas.

The behavior contract lives in [`SPEC.md`](./SPEC.md). It is the single source
of truth — locked to RFC 6901 (JSON Pointer) and RFC 6902 (JSON Patch) for
30-year forward compatibility. Code, docs, and tests defer to SPEC.md.

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

## Install

```sh
npm install zod-crud zod
```

`zod` is a peer dependency. `zod-crud` is ESM-only, so use `import` from Node
ESM, TypeScript, or a bundler.

## When To Use It

Use `zod-crud` when an app edits JSON as a document structure: nested menus,
schema-aware admin data, settings trees, rule editors, JSON inspectors, or other
interfaces where selection and mutation happen at object fields, array items,
and primitive leaves.

It is not a UI component, form library, JSON Schema renderer, persistence
layer, or visual treegrid. Consumers own rendering and storage.

## Safety Contract

- Every committed document must pass the root Zod schema.
- Zod parsed output must be JSON-identical to stored JSON. If Zod would strip,
  coerce, transform, or add data to an already-stored candidate, the mutation is
  rejected.
- Failed operations leave document state, history, clipboard, and id allocation
  unchanged.
- Mutations return `OperationResult` instead of throwing for expected invalid
  input. Read-only helpers may throw for malformed docs or invalid ids.

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
}, {
  focusFilter: (doc, nodeId) => doc.nodes[nodeId]?.type === "object",
  defaultFor: () => ({ kind: "text", text: "" }),
});

const rootId = editor.snapshot().rootId;
const childrenId = editor.find(rootId, "children");
const textNodeId = editor.find(childrenId!, 0);

const unsubscribe = editor.subscribe(() => {
  console.log(editor.snapshot());
});

editor.insertAfter(textNodeId!, { kind: "text", text: "next" });
editor.appendChild(rootId, { kind: "text", text: "child" });

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
unsubscribe();
```

## Serializable Engine State

`createJsonCrudState(schema, initialValue)` creates the durable engine state
without constructing a mutable editor instance. `dispatchJsonCrudCommand()`
applies serializable commands to that state. The returned state is plain JSON
data: it contains the flat document, allocator cursor, clipboard, history,
locks, revision, and saved snapshot, but never the Zod schema, callbacks, or
subscribers.

```ts
import * as z from "zod";
import { createJsonCrudState, dispatchJsonCrudCommand } from "zod-crud";

const schema = z.object({
  title: z.string(),
});

const state = createJsonCrudState(schema, {
  title: "Draft",
});

const next = dispatchJsonCrudCommand(state, {
  type: "update",
  nodeId: state.doc.rootId,
  value: { title: "Published" },
}, {
  schema,
  childKeys: ["children"],
});

const restored = JSON.parse(JSON.stringify(next.state));
```

This is the migration path toward pure command dispatch, replayable history,
and future collaboration adapters. The existing `createJsonCrud()` facade
remains the compatibility API for current consumers.

## API Reference

### `createJsonCrud(schema, initialValue, options?)`

Options:

- `childKeys?: string[]` controls object fields treated as child arrays for paste and append helpers. The default is `["children"]`.
- `focusFilter?: (doc, candidateId) => boolean` filters core focus candidates before `OperationResult.focusNodeId` is returned.
- `defaultFor?: (parentPath) => JsonValue` supplies a value when `create`, `insertBefore`, `insertAfter`, or `appendChild` is called without an explicit value.

### `crud.subscribe(notify)`

Registers a listener called after committed document mutations, including
`create`, `update`, `rename`, `delete`, `cut`, `paste`, `undo`, and `redo`.
Clipboard-only `copy` operations do not notify because the document is unchanged.
The return value unsubscribes the listener.

### `crud.insertAfter(siblingId, value?)`

Inserts into the sibling's array parent immediately after `siblingId`.
When `value` is omitted, `defaultFor(parentPath)` is used first; if absent,
the child schema is asked to parse `undefined`, which supports Zod defaults.

### `crud.insertBefore(siblingId, value?)`

Same as `insertAfter`, but inserts immediately before `siblingId`.

### `crud.appendChild(parentId, value?)`

Appends to an array node, or to an object node's child array field. Object child
array fields are discovered from schema array fields, existing array children,
and `childKeys`.

## Current Scope

- `serialize()` / `deserialize()`
- flat JSON node table
- `create`, `update`, `rename`, `delete`, `deleteMany`
- `insertBefore`, `insertAfter`, `appendChild`
- `copy`, `copyMany`, `cut`, `cutMany`, `paste`
- `canCopyMany`, `canCutMany`, `canDeleteMany`, `canPaste`
- `undo`, `redo`
- `subscribe`
- `OperationResult.changes` for changed `JsonDoc` nodes from the operation delta
- `OperationResult.focusNodeIds` for batch-created focus targets
- `focusFilter` for domain-visible focus candidates
- `defaultFor` and Zod defaults for omitted create values
- recursive Zod object/array/union path validation
- `children` convention for child paste, configurable via `childKeys`
