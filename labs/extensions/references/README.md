# @zod-crud/references

Lab extension for stable references and backlinks over JSON documents.

Scope:

- index schema-described targets with stable IDs
- index outgoing references and backlinks
- report missing targets, duplicate target IDs, ambiguous targets, and invalid reference values
- set a reference field through `doc.canPatch` and `doc.patch`
- avoid assuming any field name such as `id`

Out of scope:

- link UI
- hover cards
- graph visualization
- routing
- remote lookup
- app-specific ID policy

```ts
const references = createReferences(doc, {
  targets: [{
    target: "entry",
    query: "$.entries[*]",
    readId: (value) => typeof value === "object" && value !== null
      ? (value as { uid?: unknown }).uid
      : undefined,
  }],
  fields: [{
    field: "relatedEntries",
    target: "entry",
    query: "$.pages[*].relatedEntryIds",
  }],
});

const backlinks = references.backlinks("entry", "intro");
```

Friction report:

- Core `query`, `at`, `canPatch`, and `patch` are enough for a first
  reference/backlink engine.
- Stable identity still feels like extension responsibility because host
  products choose different ID fields and relation shapes.
- A descriptor primitive may emerge if `references`, `bookmarks`, and future
  cross-document packages repeat the same target/query/readId shape.
