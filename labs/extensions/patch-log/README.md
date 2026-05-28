# @zod-crud/patch-log

Patch recording and replay helpers for `zod-crud` documents.

Lab status: private prototype. Not an official package.

```ts
import { createPatchLog } from "@zod-crud/patch-log";

const log = createPatchLog(doc);

doc.patch({ op: "replace", path: "/title", value: "Next" }, { label: "rename" });

log.entries();
log.replayInto(otherDoc);
```

Public API pressure:

- `createPatchLog(doc)`
- `entries()`
- `clear()`
- `pause()` / `resume()`
- `replayInto(targetDoc, { mode: "patch" | "commit" })`
- `dispose()`

Friction:

- `subscribe` always supplies document-level metadata; even patch-only logs see selection snapshots.
- `patch` can replay full metadata, but `commit` only accepts history/selection options, so replay maps metadata down to label/origin/mergeKey unless explicit commit options are provided.
- Defensive copies need extension-local cloning because no public immutable patch snapshot helper exists.
