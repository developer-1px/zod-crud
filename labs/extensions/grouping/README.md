# @zod-crud/grouping

Lab extension for structural `group` and `ungroup`.

## Scope

- select contiguous sibling JSON array items
- create one host-defined group value
- ungroup a host-defined group value back into sibling items
- return JSON Patch operations and `selectionAfter`
- validate through the public `zod-crud` document facade

## Non-goals

- 2D bounds
- hit testing
- group-local coordinates
- visual selection handles
- app-specific ids beyond the host `createGroup` function

```ts
const grouping = createGrouping(doc, {
  isGroup: (value) => isGroupNode(value),
  getChildren: (value) => isGroupNode(value) ? value.children : null,
  createGroup: (children) => ({
    type: "group",
    id: crypto.randomUUID(),
    children,
  }),
});

const canGroup = grouping.canGroup(["/items/0", "/items/1"]);
if (canGroup.ok) grouping.group(canGroup.source);
```

## Friction report

- `group` is a real editor feature vocabulary, but the JSON shape is host-owned.
- Public pointer helpers were enough for same-parent selection planning.
- `selectionAfter` is useful enough to belong in the extension result.
- This should remain lab-only until another product proves the same command
  contract with a different schema.
