import type {
  JSONDocument,
} from "@interactive-os/json-document";

import {
  persistenceError,
} from "./errors.js";
import type {
  DocumentPersistenceSaveResult,
  DocumentPersistenceWatchEvent,
  DocumentPersistenceWatchHandle,
  DocumentPersistenceWatchOptions,
} from "./types.js";

export function watchDocumentPersistence<T>(
  doc: JSONDocument<T>,
  save: () => Promise<DocumentPersistenceSaveResult>,
  watchOptions: DocumentPersistenceWatchOptions = {},
): DocumentPersistenceWatchHandle {
  let active = true;
  let pending = 0;
  let saving = false;
  let lastResult: DocumentPersistenceSaveResult | null = null;
  let queue: Promise<DocumentPersistenceSaveResult | null> = Promise.resolve(null);
  const enqueue = (event: DocumentPersistenceWatchEvent): void => {
    pending += 1;
    queue = queue
      .then(async () => {
        pending -= 1;
        if (!active) return lastResult;
        saving = true;
        const result = await save();
        saving = false;
        lastResult = result;
        watchOptions.onSave?.(result, event);
        return result;
      })
      .catch((cause: unknown) => {
        saving = false;
        const result = persistenceError("persistence_write_failed", "failed to write persisted document", cause);
        lastResult = result;
        watchOptions.onSave?.(result, event);
        return result;
      });
  };

  if (watchOptions.immediate === true) enqueue({ applied: [] });
  const unsubscribe = doc.subscribe((applied, metadata) => {
    enqueue(metadata === undefined ? { applied } : { applied, metadata });
  });

  const stop = () => {
    active = false;
    unsubscribe();
  };
  const handle = stop as DocumentPersistenceWatchHandle;
  handle.stop = stop;
  handle.flush = async () => queue;
  handle.status = () => ({
    active,
    pending,
    saving,
    lastResult,
  });
  return handle;
}
