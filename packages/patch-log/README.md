# @zod-crud/patch-log

Official headless patch recording and replay extension for `zod-crud`
documents.

Use it when a product needs a copied applied-patch stream without reading core
history internals: audit mirrors, replay fixtures, support repro scripts,
command debugging panels, import dry runs, or synchronization adapters.

```ts
import { createPatchLog } from "@zod-crud/patch-log";

const log = createPatchLog(doc);

doc.patch({ op: "replace", path: "/title", value: "Next" }, { label: "rename" });

log.entries();
log.replayInto(otherDoc);
```

## Scope

- Record applied JSON Patch operations from `doc.subscribe`.
- Preserve JSON-safe change metadata when present.
- Return defensive copies from `entries()`.
- Pause, resume, clear, and dispose recording.
- Replay entries into another compatible document through `patch` or `commit`.
- Stop replay before applying an entry rejected by `targetDoc.canPatch`.

## Non-goals

- No undo/redo history inspection.
- No command label UI, timeline UI, persistence, storage, network transport,
  CRDT, OT, or conflict resolution.
- No guarantee that entries match core undo stack boundaries.
- No durable log format versioning.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Contract

`@zod-crud/patch-log` delegates to the public `zod-crud` facade:
`subscribe`, `canPatch`, `patch`, and `commit`.

Core remains the owner of mutation, validation, metadata emission, and history.
This extension owns an external copied patch stream and replay convenience.
