import type {
  DocumentPersistenceError,
  DocumentPersistenceErrorCode,
} from "./types.js";

export function persistenceError(
  code: DocumentPersistenceErrorCode,
  reason: string,
  cause?: unknown,
): DocumentPersistenceError {
  if (cause === undefined) return { ok: false, code, reason };
  return { ok: false, code, reason, cause };
}
