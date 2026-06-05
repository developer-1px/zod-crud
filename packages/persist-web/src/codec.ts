import {
  WEB_PERSISTENCE_KIND,
  WEB_PERSISTENCE_VERSION,
} from "./constants.js";
import {
  persistenceError,
} from "./errors.js";
import {
  normalizeSelection,
} from "./selection.js";
import type {
  DocumentPersistenceCodec,
  DocumentPersistenceEnvelope,
  DocumentPersistenceError,
  DocumentPersistencePayload,
  SnapshotReadResult,
} from "./types.js";

export const defaultDocumentPersistenceCodec: DocumentPersistenceCodec = {
  encode(input) {
    return JSON.stringify({
      kind: WEB_PERSISTENCE_KIND,
      version: WEB_PERSISTENCE_VERSION,
      value: input.value,
      selection: input.selection,
      savedAt: input.savedAt,
    } satisfies DocumentPersistenceEnvelope);
  },
  decode(text) {
    const value = JSON.parse(text) as unknown;
    if (isDocumentPersistenceEnvelope(value)) {
      return {
        value: value.value,
        selection: normalizeSelection(value.selection),
        savedAt: typeof value.savedAt === "string" ? value.savedAt : null,
      };
    }

    return {
      value,
      selection: null,
      savedAt: null,
    };
  },
};

export function encodeSnapshot(
  codec: DocumentPersistenceCodec,
  snapshot: DocumentPersistencePayload,
): { ok: true; text: string } | DocumentPersistenceError {
  try {
    return { ok: true, text: codec.encode(snapshot) };
  } catch (cause) {
    return persistenceError("persistence_serialize_failed", "failed to serialize persisted document", cause);
  }
}

export function decodeSnapshot(codec: DocumentPersistenceCodec, text: string): SnapshotReadResult {
  try {
    return { ok: true, snapshot: normalizePersistencePayload(codec.decode(text)) };
  } catch (cause) {
    return persistenceError("persistence_parse_failed", "failed to parse persisted document", cause);
  }
}

function normalizePersistencePayload(input: DocumentPersistencePayload): DocumentPersistencePayload {
  const candidate = input as {
    value?: unknown;
    selection?: unknown;
    savedAt?: unknown;
  };
  return {
    value: candidate.value,
    selection: normalizeSelection(candidate.selection),
    savedAt: typeof candidate.savedAt === "string" ? candidate.savedAt : null,
  };
}

function isDocumentPersistenceEnvelope(value: unknown): value is DocumentPersistenceEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { kind?: unknown; version?: unknown; value?: unknown };
  return candidate.kind === WEB_PERSISTENCE_KIND && candidate.version === WEB_PERSISTENCE_VERSION && "value" in candidate;
}
