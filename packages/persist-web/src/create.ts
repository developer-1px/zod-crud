import type {
  JSONDocument,
} from "zod-crud";

import {
  defaultDocumentPersistenceCodec,
} from "./codec.js";
import {
  restoreDocumentSnapshot,
} from "./restore.js";
import {
  clearDocumentSnapshot,
  readDocumentSnapshot,
  saveDocumentSnapshot,
} from "./snapshot.js";
import type {
  CreateDocumentPersistenceOptions,
  DocumentPersistence,
} from "./types.js";
import {
  watchDocumentPersistence,
} from "./watch.js";

export function createDocumentPersistence<T>(
  doc: JSONDocument<T>,
  options: CreateDocumentPersistenceOptions,
): DocumentPersistence<T> {
  const codec = options.codec ?? defaultDocumentPersistenceCodec;
  const { key } = options;

  const save = () => saveDocumentSnapshot(doc, key, codec, options.host);

  return {
    save,

    async restore(restoreOptions = {}) {
      const snapshot = await readDocumentSnapshot(key, codec, options.host);
      if (!snapshot.ok) return snapshot;
      return restoreDocumentSnapshot(doc, key, snapshot.snapshot, restoreOptions);
    },

    watch(watchOptions = {}) {
      return watchDocumentPersistence(doc, save, watchOptions);
    },

    clear: () => clearDocumentSnapshot(key, options.host),
  };
}
