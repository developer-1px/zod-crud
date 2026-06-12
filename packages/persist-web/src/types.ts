import type {
  JSONChangeMetadata,
  JSONDocument,
  JSONPatchOperation,
  JSONResult,
  SelectionSnap,
} from "@interactive-os/json-document";

import type {
  WEB_PERSISTENCE_KIND,
  WEB_PERSISTENCE_VERSION,
} from "./constants.js";

export type MaybePromise<T> = T | Promise<T>;

export interface DocumentPersistenceHost {
  getItem?: (key: string) => MaybePromise<string | null | undefined>;
  setItem?: (key: string, value: string) => MaybePromise<void>;
  removeItem?: (key: string) => MaybePromise<void>;
  read?: (key: string) => MaybePromise<string | null | undefined>;
  write?: (key: string, value: string) => MaybePromise<void>;
  remove?: (key: string) => MaybePromise<void>;
}

export interface DocumentPersistencePayload {
  value: unknown;
  selection: SelectionSnap | null;
  savedAt: string | null;
}

export interface DocumentPersistenceEnvelope extends DocumentPersistencePayload {
  kind: typeof WEB_PERSISTENCE_KIND;
  version: typeof WEB_PERSISTENCE_VERSION;
}

export interface DocumentPersistenceCodec {
  encode(input: DocumentPersistencePayload): string;
  decode(text: string): DocumentPersistencePayload;
}

export interface CreateDocumentPersistenceOptions {
  key: string;
  host?: DocumentPersistenceHost;
  codec?: DocumentPersistenceCodec;
}

export interface DocumentPersistenceRestoreOptions {
  preserveHistory?: boolean;
  restoreSelection?: boolean;
}

export interface DocumentPersistenceWatchEvent {
  applied: ReadonlyArray<JSONPatchOperation>;
  metadata?: JSONChangeMetadata;
}

export interface DocumentPersistenceWatchOptions {
  immediate?: boolean;
  onSave?: (result: DocumentPersistenceSaveResult, event: DocumentPersistenceWatchEvent) => void;
}

export interface DocumentPersistenceWatchStatus {
  active: boolean;
  pending: number;
  saving: boolean;
  lastResult: DocumentPersistenceSaveResult | null;
}

export interface DocumentPersistenceWatchHandle {
  (): void;
  stop(): void;
  flush(): Promise<DocumentPersistenceSaveResult | null>;
  status(): DocumentPersistenceWatchStatus;
}

export type DocumentPersistenceErrorCode =
  | "persistence_unavailable"
  | "persistence_empty"
  | "persistence_serialize_failed"
  | "persistence_parse_failed"
  | "persistence_read_failed"
  | "persistence_write_failed"
  | "persistence_remove_failed"
  | "persistence_restore_failed";

export interface DocumentPersistenceError {
  ok: false;
  code: DocumentPersistenceErrorCode;
  reason: string;
  cause?: unknown;
}

export interface DocumentPersistenceSaveOk {
  ok: true;
  key: string;
  savedAt: string;
  selectionSaved: boolean;
}

export interface DocumentPersistenceClearOk {
  ok: true;
  key: string;
}

export interface DocumentPersistenceRestoreOk<T> {
  ok: true;
  key: string;
  value: T;
  savedAt: string | null;
  selectionSaved: boolean;
  selectionRestored: boolean;
}

export type DocumentPersistenceLoadError = Extract<JSONResult, { ok: false }>;

export type DocumentPersistenceSaveResult = DocumentPersistenceSaveOk | DocumentPersistenceError;
export type DocumentPersistenceClearResult = DocumentPersistenceClearOk | DocumentPersistenceError;
export type DocumentPersistenceRestoreResult<T> =
  | DocumentPersistenceRestoreOk<T>
  | DocumentPersistenceLoadError
  | DocumentPersistenceError;

export interface DocumentPersistence<T> {
  save(): Promise<DocumentPersistenceSaveResult>;
  restore(options?: DocumentPersistenceRestoreOptions): Promise<DocumentPersistenceRestoreResult<T>>;
  watch(options?: DocumentPersistenceWatchOptions): DocumentPersistenceWatchHandle;
  clear(): Promise<DocumentPersistenceClearResult>;
}

export type SnapshotReadResult =
  | { ok: true; snapshot: DocumentPersistencePayload }
  | DocumentPersistenceError;

export type DocumentPersistenceDoc<T> = JSONDocument<T>;
