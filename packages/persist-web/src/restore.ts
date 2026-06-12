import {
  JSONDocumentError,
  type JSONDocument,
  type JSONResult,
} from "@interactive-os/json-document";

import {
  persistenceError,
} from "./errors.js";
import {
  selectionPointersExist,
} from "./selection.js";
import type {
  DocumentPersistencePayload,
  DocumentPersistenceRestoreOptions,
  DocumentPersistenceRestoreResult,
} from "./types.js";

export function restoreDocumentSnapshot<T>(
  doc: JSONDocument<T>,
  key: string,
  snapshot: DocumentPersistencePayload,
  restoreOptions: DocumentPersistenceRestoreOptions,
): DocumentPersistenceRestoreResult<T> {
  let loaded: JSONResult;
  try {
    loaded = loadDocument(doc, snapshot.value, restoreOptions.preserveHistory === true);
  } catch (cause) {
    return persistenceError("persistence_restore_failed", "failed to restore persisted document", cause);
  }
  if (!loaded.ok) return loaded;

  const selection = snapshot.selection;
  const shouldRestoreSelection =
    restoreOptions.restoreSelection === true
    && selection !== null
    && doc.selection !== undefined;
  if (shouldRestoreSelection) {
    try {
      if (selectionPointersExist(doc, selection)) {
        doc.selection.restore(selection);
      }
    } catch (cause) {
      return persistenceError("persistence_restore_failed", "failed to restore persisted selection", cause);
    }
  }

  return {
    ok: true,
    key,
    value: doc.value,
    savedAt: snapshot.savedAt,
    selectionSaved: selection !== null,
    selectionRestored: shouldRestoreSelection && selectionPointersExist(doc, selection),
  };
}

function loadDocument<T>(
  doc: JSONDocument<T>,
  value: unknown,
  preserveHistory: boolean,
): JSONResult {
  try {
    return doc.load(value, { preserveHistory });
  } catch (cause) {
    if (cause instanceof JSONDocumentError) return cause.result;
    throw cause;
  }
}
