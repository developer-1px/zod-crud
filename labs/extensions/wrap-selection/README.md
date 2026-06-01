# @zod-crud/wrap-selection

Lab extension for structural `wrap` and `unwrap`.

Use it to implement editor features such as wrapping blocks in a section,
callout, toggle, container, or other host-defined structural node.

## Scope

- select one or more contiguous sibling JSON array items
- create one host-defined wrapper value
- unwrap a host-defined wrapper back into sibling items
- return JSON Patch operations and `selectionAfter`
- validate through the public `zod-crud` document facade

## Non-goals

- object grouping semantics
- 2D bounds, layout, hit testing, or visual handles
- product-specific wrapper names
- field preservation policy beyond the host `createWrapper` function
- plugin registration
- `zod-crud` internal imports

```ts
const wrappers = createWrapSelection(doc, {
  isWrapper: (value) => isCallout(value),
  getChildren: (value) => isCallout(value) ? value.children : null,
  createWrapper: (children) => ({
    type: "callout",
    children,
  }),
});

const canWrap = wrappers.canWrap("/blocks/0");
if (canWrap.ok) wrappers.wrap(canWrap.source);
```

## Friction report

- `wrap`/`unwrap` is close to `group`/`ungroup` mechanically, but the product
  concept is different: wrappers are structural containers, not object groups.
- Public pointer helpers, `doc.at`, `doc.canPatch`, and `doc.patch` are enough
  for the first lab.
- `selectionAfter` belongs in the feature result because apps need to move
  focus to the new wrapper or unwrapped children.
- Keep this lab separate from `grouping` until dogfooding shows whether they
  share a lower-level structural primitive or should remain separate concepts.
