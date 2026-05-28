# @zod-crud/persist-web

Official headless web persistence extension for `zod-crud` documents.

Use it when a product needs local draft save/restore without putting storage
policy in core: browser drafts, settings editors, generated admin forms, CMS
resource editors, slide editors, spreadsheet tabs, or embedded workbenches.

```ts
import { createDocumentPersistence } from "@zod-crud/persist-web";

const persistence = createDocumentPersistence(doc, { key: "draft" });

await persistence.save();
await persistence.restore({ preserveHistory: true, restoreSelection: true });
const stop = persistence.watch();
await persistence.clear();
stop();
```

## Scope

- Save the current document value to a storage-like host.
- Restore a persisted value through `doc.load`.
- Optionally preserve current history during restore through the public
  `doc.load` option.
- Optionally save and restore selection snapshots when document selection is
  enabled.
- Watch document changes through `doc.subscribe` and enqueue saves.
- Use `globalThis.localStorage` by default when no host is injected.
- Support injected `getItem`/`setItem`/`removeItem` or
  `read`/`write`/`remove` hosts for tests and custom runtimes.

## Non-goals

- No server persistence, sync protocol, offline queue, CRDT, OT, merge, or
  conflict resolution.
- No save button, autosave indicator, route lifecycle, focus, keyboard, or UI
  policy.
- No durable undo/redo history serialization.
- No schema migration framework; inject a codec when stored payloads need
  migration.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Contract

`@zod-crud/persist-web` delegates to the public `zod-crud` facade:
`value`, `load`, `subscribe`, and optional `selection.snapshot` /
`selection.restore`.

Core remains the owner of document mutation, validation, selection, and history
behavior. This extension owns host storage I/O, persisted envelope shape, and
save/restore orchestration.
