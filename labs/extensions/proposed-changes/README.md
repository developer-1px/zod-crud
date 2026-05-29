# @zod-crud/proposed-changes

Lab extension for proposed document changes.

This package is not an autocomplete, combobox, mention, or slash-command
surface. It stores proposed JSON Patch changes so a host editor can review,
accept, reject, persist, and explain them without rendering assumptions.

Status:

- lab-only
- private package
- not promoted to official extension yet

Promotion is deferred until downstream dogfooding proves that the proposed
change boundary is stable across more than one editor host.

Scope:

- propose schema-safe document patches without mutating the document
- accept an open proposed change through `doc.patch`
- reject an open proposed change without document mutation
- detect stale changes by comparing guarded target values
- restore persisted changes through `createProposedChanges(doc, { initial })`
  or `proposedChanges.load(...)`
- preserve structured `can*` and execution results

Out of scope:

- autocomplete, mention, or slash-command surfaces
- review UI
- comment threads
- author identity
- remote collaboration
- approval workflow policy
- text diff rendering
- storage adapter policy

```ts
const proposedChanges = createProposedChanges(doc);

proposedChanges.propose({
  id: "rename-title",
  operations: { op: "replace", path: "/title", value: "Reviewed" },
  data: {
    proposedBy: "assistant",
    source: "nano-edit",
    createdAt: "2026-05-29T00:00:00.000Z",
  },
});

if (proposedChanges.canAccept("rename-title").ok) {
  proposedChanges.accept("rename-title", { label: "accept proposed change" });
}
```

Persistence:

```ts
const persisted = proposedChanges.current({ status: "all" }).changes;
const restored = createProposedChanges(doc, { initial: persisted });

restored.load(persistedFromStorage);
```

The host owns storage, sync, migration, and audit policy. This package only
guarantees that serialized `ProposedChange` values are copied back into the
in-memory review model and that generated IDs continue after restored
`change-N` IDs.

Guard semantics:

```text
replace/remove/test -> guard operation.path
add                 -> guard parent(operation.path)
move/copy           -> guard operation.from and parent(operation.path)
```

`canAccept(id)` returns `stale_change` with the changed guard pointer when the
guarded document value no longer matches the value captured at proposal time.

Audit metadata convention:

`data` remains host-owned. For AI change review flows, prefer the exported
`ProposedChangeAuditData` shape:

```ts
{
  proposedBy?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  reviewerNote?: string;
}
```

Downstream host flow:

```text
editor command / AI result
-> host maps intent to JSON Patch
-> proposedChanges.canPropose(...)
-> proposedChanges.propose(...)
-> host renders current({ status: "all" })
-> host persists snapshot.changes if needed
-> canAccept(id) controls disabled/reason UI
-> accept(id) applies doc.patch(...)
-> reject(id) closes without document mutation
```

Friction report:

- Core `canPatch` is enough to reject schema-invalid proposals before storage.
- Core `patch` is enough to accept proposed changes atomically.
- The extension needs local guard values to avoid accepting stale changes that
  would otherwise still be patchable.
- Persistence does not require a core change yet because serialized
  `ProposedChange` values can be restored at extension level.
- No core change is recommended yet. Watch whether `proposed-changes`,
  `protected-ranges`, and `patch-preview` repeat a common guard primitive.
