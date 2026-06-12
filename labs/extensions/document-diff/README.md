# @interactive-os/json-document-document-diff

Lab document diff and apply extension for `@interactive-os/json-document` documents.

Use it to test whether import/reconcile/apply-target flows can stay outside
core while still producing normal JSON Patch operations.

```ts
import { createDocumentDiff } from "@interactive-os/json-document-document-diff";

const diff = createDocumentDiff(doc);

const change = diff.diff(nextValue);
diff.apply(nextValue, { label: "import" });
```

## Scope

- Compare the current document value with a target JSON value.
- Produce a compact JSON Patch batch for object field changes.
- Replace arrays as arrays instead of owning collection identity policy.
- Preflight the batch through `doc.canPatch`.
- Apply the batch through `doc.patch`.

## Non-goals

- No CRDT, OT, merge conflict UI, or synchronization protocol.
- No array item identity matching or move inference.
- No product import wizard, preview table, confirmation UI, keyboard, or focus
  policy.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `@interactive-os/json-document` internal imports.

## Friction report

The public facade is enough for basic value reconciliation: read `doc.value`,
derive JSON Patch, validate with `canPatch`, then apply with `patch`.

Array semantics are the explicit tradeoff. Without stable identity policy, this
lab replaces arrays as arrays. Products that need row/card identity should keep
that host-owned policy outside core instead of moving it into document mutation
primitives.
