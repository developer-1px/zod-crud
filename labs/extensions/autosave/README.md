# @zod-crud/autosave

Lab autosave extension for `zod-crud` documents.

Use it to test whether autosave can stay outside core while using only the
public document subscription and current value.

```ts
import { createAutoSave } from "@zod-crud/autosave";

const autosave = createAutoSave(doc, {
  save: async ({ value }) => {
    await api.saveDraft(value);
  },
});

await autosave.flush();
```

## Scope

- Subscribe to document patch events.
- Schedule host-owned save work.
- Save the latest `doc.value` snapshot.
- Coalesce changes while a save is pending or running.
- Expose headless status and subscriber notifications.

## Non-goals

- No storage, server, fetch, retry, backoff, conflict resolution, or offline
  queue policy.
- No save button, toast, spinner, keyboard, focus, or dirty badge UI.
- No persistence envelope; compose persistence separately if needed.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Friction report

The public facade is enough for autosave orchestration: `doc.subscribe` tells the
extension that a valid change happened, and `doc.value` gives the latest
schema-valid snapshot.

This lab intentionally keeps scheduler, transport, retry, conflict, and UI
policy outside core.
