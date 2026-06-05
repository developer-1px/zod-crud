import type {
  JSONDocument,
} from "zod-crud";

import {
  decodeSnapshot,
  encodeSnapshot,
} from "./codec.js";
import {
  persistenceError,
} from "./errors.js";
import {
  resolveReadHost,
  resolveRemoveHost,
  resolveWriteHost,
} from "./host.js";
import type {
  DocumentPersistenceClearResult,
  DocumentPersistenceCodec,
  DocumentPersistenceHost,
  DocumentPersistencePayload,
  DocumentPersistenceSaveResult,
  SnapshotReadResult,
} from "./types.js";

export async function saveDocumentSnapshot<T>(
  doc: JSONDocument<T>,
  key: string,
  codec: DocumentPersistenceCodec,
  host: DocumentPersistenceHost | undefined,
): Promise<DocumentPersistenceSaveResult> {
  const resolvedHost = resolveWriteHost(host);
  if (!resolvedHost.ok) return resolvedHost;

  const savedAt = new Date().toISOString();
  const snapshot: DocumentPersistencePayload = {
    value: doc.value,
    selection: doc.selection?.snapshot() ?? null,
    savedAt,
  };
  const encoded = encodeSnapshot(codec, snapshot);
  if (!encoded.ok) return encoded;

  try {
    await resolvedHost.write(key, encoded.text);
    return {
      ok: true,
      key,
      savedAt,
      selectionSaved: snapshot.selection !== null,
    };
  } catch (cause) {
    return persistenceError("persistence_write_failed", "failed to write persisted document", cause);
  }
}

export async function readDocumentSnapshot(
  key: string,
  codec: DocumentPersistenceCodec,
  host: DocumentPersistenceHost | undefined,
): Promise<SnapshotReadResult> {
  const resolvedHost = resolveReadHost(host);
  if (!resolvedHost.ok) return resolvedHost;

  try {
    const text = await resolvedHost.read(key);
    if (text == null) return persistenceError("persistence_empty", "no persisted document exists");
    return decodeSnapshot(codec, text);
  } catch (cause) {
    return persistenceError("persistence_read_failed", "failed to read persisted document", cause);
  }
}

export async function clearDocumentSnapshot(
  key: string,
  host: DocumentPersistenceHost | undefined,
): Promise<DocumentPersistenceClearResult> {
  const resolvedHost = resolveRemoveHost(host);
  if (!resolvedHost.ok) return resolvedHost;

  try {
    await resolvedHost.remove(key);
    return { ok: true, key };
  } catch (cause) {
    return persistenceError("persistence_remove_failed", "failed to remove persisted document", cause);
  }
}
