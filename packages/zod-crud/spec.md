# zod-crud Logic Tree Spec

This document is the single source of truth for expected behavior. When code,
tests, README examples, and agent/debug reports disagree, update this spec
first or explicitly mark the implementation as out of spec.

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
- Successful committed operations should include `changes` on `OperationResult`.
  `changes` contains only inserted, updated, and deleted `JsonDoc` nodes from
  the committed operation delta, not a full document snapshot.
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
- Object child keys can be renamed with `rename(nodeId, key)` when the parent
  remains a valid object under the root schema.
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

### createJsonCrud()

```txt
createJsonCrud(schema, initialValue)
  safeParse(initialValue)
    fail -> throw ZodError
    success -> serialize(parsed.data)
  validate full document exactness
    fail -> throw Error(reason)
    success -> initialize doc, childKeys, focusFilter, defaultFor, empty history, empty clipboard, subscribers
```

Factory typing must preserve schema input type. `createJsonCrud` should reject
invalid schema inputs at compile time where TypeScript can infer them.

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
compute the create delta
commit and return { ok: true, nodeId: createdRootId, focusNodeId, changes }
or return failure
```

If `value` is omitted, `create` must resolve a default value before mutation:

```txt
defaultFor option exists -> use clone(defaultFor(parentPath))
else schema at child path parses undefined -> use parsed data
else fail with "No default value is configured for create."
```

### insertAfter(siblingId, value)

```txt
sibling missing -> fail
sibling is root -> fail
sibling parent is not array -> fail
compute sibling index in parent array
delegate to create(parentId, index + 1, value)
```

### insertBefore(siblingId, value)

```txt
sibling missing -> fail
sibling is root -> fail
sibling parent is not array -> fail
compute sibling index in parent array
delegate to create(parentId, index, value)
```

### appendChild(parentId, value)

```txt
parent is array -> append at array length
parent is object -> find or create a child array field from schema array fields,
existing array children, or childKeys
parent is primitive -> fail
validate affected parent subtree and full document
commit and return { ok: true, nodeId: createdRootId, focusNodeId, changes }
```

### update(nodeId, value)

```txt
find node path
validate value at path
clone current doc
replace subtree at nodeId
validate full document exactness
compute the replacement delta
commit and return { ok: true, nodeId, focusNodeId, changes } or return failure
```

### rename(nodeId, key)

```txt
nodeId is root -> fail
node parent is not object -> fail
key already exists under the same object parent -> fail, unless it is the same node
clone current doc
change only the target node key
validate parent path subtree
validate full document exactness
compute the renamed node update delta
commit and return { ok: true, nodeId, focusNodeId, changes } or return failure
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
compute the delete delta
commit and return { ok: true, nodeId, focusNodeId, changes } where nodeId is
the removed root, or return failure
```

### subscribe(notify)

```txt
add notify to subscriber set
return unsubscribe function
successful committed document mutations call all current subscribers after doc changes
copy-only operations do not notify because JsonDoc is unchanged
```

`subscribe` is intended to match React `useSyncExternalStore` and external store
resource APIs.

### focusFilter

When `createJsonCrud` receives `focusFilter`, core focus computation must skip
candidate ids for which `focusFilter(afterDoc, candidateId)` returns false.

```txt
focus candidate order is unchanged
candidate missing in after doc -> skip
focusFilter returns false -> skip
no candidate accepted -> after.rootId
```

### deleteMany(nodeIds)

`deleteMany` is a batch mutation for sibling selections. It is intentionally
narrower than arbitrary tree selection so the first multi-node operation keeps
one parent validation path, one commit, one undo entry, and one focus result.

```txt
nodeIds empty -> fail
any nodeId is root -> fail
any node missing -> fail gracefully
dedupe node ids
all nodes must have the same live parent
find parent path
clone current doc
remove selected sibling subtrees from highest sibling index to lowest
normalize array parent keys if needed
validate parent path subtree
validate full document exactness
compute one delete delta containing all removed subtrees
compute batch delete focus as next sibling after the removed range, previous
  sibling before the removed range, live parent, or root
commit once and return { ok: true, nodeId, focusNodeId, changes } where nodeId
is the highest-index removed sibling used as the history focus anchor
or return failure
```

### copy(nodeId)

```txt
read node value
store clipboard = { value, sourceId: nodeId }
return cloned JSON value
```

Copy may throw if `nodeId` is invalid because it returns a JSON value, not an
`OperationResult`.

### copyMany(nodeIds)

```txt
dedupe node ids in input order
any node missing -> throw
nodeIds empty -> throw
read each node value in input order
store clipboard = { values, sourceIds: nodeIds }
return cloned JSON values
```

### cut(nodeId)

```txt
root -> fail
read node value
delete node
  fail -> leave clipboard unchanged
  success -> clipboard = { value, sourceId: null }
return delete result
```

### cutMany(nodeIds)

```txt
read selected values in input order
deleteMany(nodeIds)
  fail -> leave clipboard unchanged
  success -> clipboard = { values, sourceIds: null }
return deleteMany result
```

### paste(targetId, options)

Paste modes:

- `overwrite`: only try replacing target subtree.
- `child`: only try child insertion candidates.
- `auto`: choose candidates from the selected target node type.

```txt
clipboard empty -> fail
target missing -> fail
build candidates
try candidates in order
  candidate throws -> remember failure
  full document exact validation fails -> remember failure
  validation succeeds -> compute the paste delta, commit exactly one candidate, and return
    { ok: true, nodeId: pastedRootId, focusNodeId, changes }
all candidates fail -> return last useful failure
```

For insert paste, `nodeId` is the newly inserted subtree root. For overwrite
paste, `nodeId` is the overwritten target root because replacement preserves
that root id.

When the clipboard contains multiple values, paste is insert-only. It inserts
all clipboard values in order into a target array, after a target array item, or
into one object child-array candidate. Multi-value paste does not overwrite a
single object or leaf target. `focusNodeId` is the last inserted root so
repeated paste appends after the active pasted node, and `focusNodeIds` contains
all inserted roots in paste order.

Auto paste candidate order:

```txt
if targetId === clipboard.sourceId and target parent is array
  only try inserting as next sibling
  do not fall through to child/overwrite after self-sibling failure
else if target is array
  try inserting into the target array
else if target is object
  try overwriting the target object
else if target leaf JSON type matches clipboard JSON type
  try overwriting the target leaf value
else
  no paste candidate
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

### canCopyMany(nodeIds)

```txt
dedupe node ids in input order
nodeIds empty -> fail
any node missing -> fail gracefully
otherwise -> { ok: true }
do not mutate document, history, clipboard, or id allocation
```

### canCutMany(nodeIds)

```txt
return canDeleteMany(nodeIds)
```

### canDeleteMany(nodeIds)

```txt
build the same deleteMany plan without committing
validate parent path subtree
validate full document exactness
return ok/failure from dry run
do not mutate document, history, clipboard, or id allocation
```

### undo()

```txt
undo stack empty -> { ok: false, reason }
push current doc to redo
restore previous doc
return the inverse delta of the original committed mutation
compute focusNodeId through the unified mutation focus strategy
return { ok: true, focusNodeId, changes }
```

### redo()

```txt
redo stack empty -> { ok: false, reason }
push current doc to undo
restore next doc
return the original forward delta of the redone mutation
compute focusNodeId through the unified mutation focus strategy
return { ok: true, focusNodeId, changes }
```

Mutation focus priority:

```txt
if primary nodeId is still live after commit -> focus primary nodeId
else if primary nodeId was removed -> focus next sibling, previous sibling,
  live parent, or root
else if delta inserts a live subtree -> focus inserted subtree root
else if delta updates an existing live node -> focus that updated node
else -> focus root
```

CRUD, paste, undo, and redo all use this same focus strategy. Direct delete is
handled as a removed primary-node mutation, so it recovers by adjacency before
falling back to parent or root.

## Package Contract

- Package is ESM-only.
- `exports["."]` must expose runtime JS and declarations.
- `prepack` must build `dist` so clean checkout packing works.
- Published package contents should be limited to `dist`, `README.md`, and
  `spec.md`.
- A package smoke test must pack the project, install the tarball into a
  temporary consumer, run a Node ESM import, and typecheck exported types.
- Package-level `npm run verify` is the library gate:

```txt
typecheck
test
build
smoke:package
```

## Test Policy

Add or update tests when behavior changes in any of these areas:

- Full-document schema invariants.
- Zod path traversal support.
- Clipboard/source id semantics.
- Undo/redo state transitions.
- Batch mutation atomicity.
- OperationResult failure atomicity.
- OperationResult focus and changed-node metadata.
- Package import/type surface.

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
