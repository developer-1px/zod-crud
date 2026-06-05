export {
  WEB_PERSISTENCE_KIND,
  WEB_PERSISTENCE_VERSION,
} from "./constants.js";
export { createDocumentPersistence } from "./create.js";
export { defaultDocumentPersistenceCodec } from "./codec.js";
export type {
  CreateDocumentPersistenceOptions,
  DocumentPersistence,
  DocumentPersistenceClearOk,
  DocumentPersistenceClearResult,
  DocumentPersistenceCodec,
  DocumentPersistenceEnvelope,
  DocumentPersistenceError,
  DocumentPersistenceErrorCode,
  DocumentPersistenceHost,
  DocumentPersistenceLoadError,
  DocumentPersistencePayload,
  DocumentPersistenceRestoreOk,
  DocumentPersistenceRestoreOptions,
  DocumentPersistenceRestoreResult,
  DocumentPersistenceSaveOk,
  DocumentPersistenceSaveResult,
  DocumentPersistenceWatchEvent,
  DocumentPersistenceWatchHandle,
  DocumentPersistenceWatchOptions,
  DocumentPersistenceWatchStatus,
} from "./types.js";
