# zod-crud Logic Tree Spec

This document is the single source of truth for expected behavior. When code,
tests, README examples, demo UX, and agent/debug reports disagree, update this
spec first or explicitly mark the implementation as out of spec.

## Product Contract

`zod-crud` is a flat JSON editing core guarded by a Zod schema.

The editor stores parsed JSON as a flat node table, exposes CRUD, clipboard, and
history operations over node ids, and commits only mutations that keep the full
document valid under the root schema.

```txt
input JSON
  -> root schema safeParse()
  -> parsed JSON output
  -> serialize() into JsonDoc
  -> node-id CRUD / clipboard / undo / redo
  -> candidate JsonDoc
  -> deserialize()
  -> root schema safeParse()
  -> exact parsed-output comparison
  -> commit or reject
```

## Core Invariants

- Every committed document must deserialize to JSON that passes the root Zod
  schema.
- The parsed schema output must be JSON-identical to the stored JSON. If Zod
  would strip, coerce, transform, add, or otherwise change the stored JSON, the
  mutation is rejected.
- Failed operations must not mutate document state, undo/redo stacks, clipboard
  content, or node id allocation.
- Successful mutating operations must push exactly one undo snapshot and clear
  redo history.
- `canPaste()` is a dry run. It may allocate temporary ids internally, but it
  must restore document state, history state, and id allocation before returning.
- Public mutation methods that return `OperationResult` should return
  `{ ok: false, reason }` for expected invalid input rather than throwing.
- Read-only methods such as `read`, `snapshot`, `pathOf`, `find`, `toJson`, and
  standalone `deserialize` may throw for malformed docs or invalid ids.

## Data Model

Each JSON value is represented by one `JsonNode`.

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

Node key rules:

- Root node key is `null`.
- Object child key is a string property name.
- Array child key is its current integer index.
- Array keys are normalized after insert/delete.
- Object children must not contain duplicate keys.
- `__proto__` is treated as an own JSON key during deserialize, not as prototype
  mutation.
- JSON numbers must be finite.

Node id rules:

- Serialized root starts at `n1`.
- IDs allocated by a `JsonCrud` instance are monotonic for that instance.
- Deleted ids are not reused later in that editor instance.
- Replacing a subtree preserves the replaced root node id and allocates fresh ids
  for its descendants.

## Schema Policy

The schema is a structural policy layer, not a lossy serializer.

Accepted:

- Zod output must be JSON-compatible.
- Defaults are allowed at construction because the parsed output is the initial
  stored JSON.
- Nullable/optional/default/catch/readonly/lazy wrappers are transparent for
  path traversal.
- Object, array, tuple, union, record, intersection, catchall/passthrough, and
  identity-like pipe/transform schemas are expected to support path traversal
  when the stored JSON can be revalidated exactly.
- Numeric record keys should follow Zod's accepted key semantics. Example:
  `"1"` may satisfy `z.record(z.number().int().positive(), ...)`; `"1.5"` must
  not satisfy an integer key schema.

Rejected:

- Mutations that would make `toJson()` throw.
- Mutations where Zod succeeds but parsed output differs from stored JSON.
- Unknown keys under stripping object schemas.
- Coerced mutation values such as setting `"5"` into `z.coerce.number()` when
  stored JSON would remain the string.
- Schemas whose parsed output cannot be parsed again as the same JSON at
  construction time, such as `z.string().transform(v => v.length)`.

When exact validation fails, the reason should include the first meaningful JSON
path whenever practical, for example a removed key, added default, type change,
or value change.

## Operation Logic Trees

### Constructor

```txt
createJsonCrud(schema, initialValue)
  safeParse(initialValue)
    fail -> throw ZodError
    success -> serialize(parsed.data)
  validate full document exactness
    fail -> throw Error(reason)
    success -> initialize doc, childKeys, empty history, empty clipboard
```

Constructor typing must preserve schema input type. `createJsonCrud` and
`new JsonCrud` should reject invalid schema inputs at compile time where
TypeScript can infer them.

### serialize(value)

```txt
create root doc
createSubtree(value, parent=null, key=null, forcedId=n1)
  array -> node.type=array, children by index
  object -> node.type=object, children by Object.entries keys
  primitive -> node.type matching value
  non-finite number -> throw
return doc
```

### deserialize(doc, nodeId = rootId)

```txt
get node
  missing -> throw
object
  for each child
    child key must be string
    duplicate key -> throw
    define own enumerable property
array
  return child values in children order
primitive
  return stored value, null for null node
```

### create(parentId, key, value)

```txt
clone current doc
find parent path
insert child
  object parent -> key must be string and unique
  array parent -> key must be integer index within 0..length
  primitive parent -> fail
validate parent path subtree
validate full document exactness
commit or return failure
```

### update(nodeId, value)

```txt
find node path
validate value at path
clone current doc
replace subtree at nodeId
validate full document exactness
commit or return failure
```

### delete(nodeId)

```txt
nodeId is root -> fail
find node and parent
clone current doc
remove node and descendants
normalize array parent keys if needed
validate parent path subtree
validate full document exactness
commit or return failure
```

### copy(nodeId)

```txt
read node value
store clipboard = { value, sourceId: nodeId }
return cloned JSON value
```

Copy may throw if `nodeId` is invalid because it returns a JSON value, not an
`OperationResult`.

### cut(nodeId)

```txt
root -> fail
read node value
delete node
  fail -> leave clipboard unchanged
  success -> clipboard = { value, sourceId: null }
return delete result
```

### paste(targetId, options)

Paste modes:

- `overwrite`: only try replacing target subtree.
- `child`: only try child insertion candidates.
- `auto`: try self-sibling if applicable, otherwise child candidates, then
  overwrite.

```txt
clipboard empty -> fail
target missing -> fail
build candidates
try candidates in order
  candidate throws -> remember failure
  full document exact validation fails -> remember failure
  validation succeeds -> commit exactly one candidate
all candidates fail -> return last useful failure
```

Auto paste candidate order:

```txt
if targetId === clipboard.sourceId and target parent is array
  only try inserting as next sibling
  do not fall through to child/overwrite after self-sibling failure
else
  try child insertion candidates
  try overwrite candidate
```

Child insertion candidates:

```txt
target is array -> insert into target array
target is object ->
  collect Zod-declared array fields at target schema
  collect existing object child arrays
  include configured childKeys fallback
  try each candidate until one validates
target is primitive -> no child candidate
```

Configured `childKeys` are fallbacks. Zod-declared array fields should be
preferred over convention-only keys.

### canPaste(targetId, options)

```txt
clipboard empty -> fail
snapshot doc, undo, redo, id allocator
run paste(targetId, options)
restore snapshots
return ok/failure from dry run
```

### undo()

```txt
undo stack empty -> false
push current doc to redo
restore previous doc
return true
```

### redo()

```txt
redo stack empty -> false
push current doc to undo
restore next doc
return true
```

## Demo UX Logic

The demo is a visual test harness for the core API. It should behave like a
small editor, not just a failure logger.

Command availability:

- Undo disabled when `canUndo()` is false.
- Redo disabled when `canRedo()` is false.
- Paste disabled when selected target's `canPaste(selectedId)` is not ok.
- Cut and Delete disabled for root.
- Create text/rect disabled when selected node has no insertion array.
- Update disabled when selected node has no editable text/name/label field.
- Keyboard shortcuts follow the same enabled/disabled rules as buttons.

Selection and focus recovery:

- After create/paste/update, focus changed or inserted visible nodes when
  possible.
- After delete/cut, recover to next sibling, previous sibling, visible parent,
  or root.
- Undo/redo should prefer visible domain nodes over hidden structural arrays
  such as `children`.
- Focus markers may show multiple changed ids, but `selected` should remain a
  visible, actionable node when possible.

Mobile/layout:

- Primary canvas should be reachable early on mobile.
- Expanded layer trees should be bounded and internally scrollable rather than
  pushing the entire editor far below the first viewport.
- Buttons and labels must not overflow their fixed controls.

## Package Contract

- Package is ESM-only.
- `exports["."]` must expose runtime JS and declarations.
- `prepack` must build `dist` so clean checkout packing works.
- Published source maps may reference `src` only if `src` is included in the
  packed files.
- A package smoke test must pack the project, install the tarball into a
  temporary consumer, run a Node ESM import, and typecheck exported types.
- `npm run verify` is the CI-level gate:

```txt
typecheck
test
build
demo:build
smoke:package
```

## Test Policy

Add or update tests when behavior changes in any of these areas:

- Full-document schema invariants.
- Zod path traversal support.
- Clipboard/source id semantics.
- Undo/redo state transitions.
- OperationResult failure atomicity.
- Package import/type surface.
- Demo command availability or focus recovery.

Regression tests should encode de-facto editor expectations, not only current
implementation details. If a behavior is debatable, record the chosen rule in
this spec first.

## Known Policy Choices

- Coercion is accepted at construction only as part of initial schema parsing.
  Later mutations must store exact JSON, not values that require coercion.
- Transform schemas are supported only when their parsed output remains
  JSON-output-idempotent under the same root schema.
- `copy()` throws for invalid ids because it returns a JSON value. Mutations that
  return `OperationResult` should fail gracefully.
- CJS `require("zod-crud")` is not supported unless a CJS build is explicitly
  added later.
