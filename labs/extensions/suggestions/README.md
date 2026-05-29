# @zod-crud/suggestions

Lab extension for proposed JSON Patch suggestions.

Scope:

- propose schema-safe document patches without mutating the document
- accept an open suggestion through `doc.patch`
- reject an open suggestion without document mutation
- detect stale suggestions by comparing guarded target values
- preserve structured `can*` and execution results

Out of scope:

- review UI
- comment threads
- author identity
- remote collaboration
- approval workflow policy
- text diff rendering

```ts
const suggestions = createSuggestions(doc);

suggestions.propose({
  id: "rename-title",
  operations: { op: "replace", path: "/title", value: "Reviewed" },
});

if (suggestions.canAccept("rename-title").ok) {
  suggestions.accept("rename-title", { label: "accept suggestion" });
}
```

Friction report:

- Core `canPatch` is enough to reject schema-invalid proposals before storage.
- Core `patch` is enough to accept suggestions atomically.
- The extension needs local guard values to avoid accepting stale proposals that
  would otherwise still be patchable.
- No core change is recommended yet. Watch whether `suggestions`,
  `protected-ranges`, and `patch-preview` repeat a common proposal/guard
  primitive.
