import type {
  JSONDocument,
} from "@interactive-os/json-document";

import {
  replayEntries,
} from "./replay.js";
import {
  createPatchLogStore,
} from "./store.js";
import type {
  PatchLog,
} from "./types.js";

export function createPatchLog<T>(doc: JSONDocument<T>): PatchLog<T> {
  const store = createPatchLogStore();
  let paused = false;
  let disposed = false;

  const unsubscribe = doc.subscribe((applied, metadata) => {
    if (paused || disposed || applied.length === 0) return;
    store.push({ applied, ...(metadata !== undefined ? { metadata } : {}) });
  });

  return {
    entries: store.entries,
    clear: store.clear,
    pause: () => { paused = true; },
    resume: () => { if (!disposed) paused = false; },
    replayInto: (targetDoc, options) => replayEntries(targetDoc, store.entries(), options),
    dispose() {
      if (disposed) return;
      disposed = true;
      paused = true;
      unsubscribe();
    },
  };
}
