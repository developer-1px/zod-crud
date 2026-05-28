import {
  JSONCrudError,
  type JSONChangeMetadata,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type SelectionPoint,
  type SelectionSnap,
} from "zod-crud";

type MaybePromise<T> = T | Promise<T>;

export const WEB_PERSISTENCE_KIND = "zod-crud.persistence+json" as const;
export const WEB_PERSISTENCE_VERSION = 1 as const;

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
  message: string;
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

export type DocumentPersistenceLoadError = Extract<JSONResult, { ok: false }> & {
  message: string;
};

export type DocumentPersistenceSaveResult = DocumentPersistenceSaveOk | DocumentPersistenceError;
export type DocumentPersistenceClearResult = DocumentPersistenceClearOk | DocumentPersistenceError;
export type DocumentPersistenceRestoreResult<T> =
  | DocumentPersistenceRestoreOk<T>
  | DocumentPersistenceLoadError
  | DocumentPersistenceError;

export interface DocumentPersistence<T> {
  save(): Promise<DocumentPersistenceSaveResult>;
  restore(options?: DocumentPersistenceRestoreOptions): Promise<DocumentPersistenceRestoreResult<T>>;
  watch(options?: DocumentPersistenceWatchOptions): () => void;
  clear(): Promise<DocumentPersistenceClearResult>;
}

type SnapshotReadResult =
  | { ok: true; snapshot: DocumentPersistencePayload }
  | DocumentPersistenceError;

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

export function createDocumentPersistence<T>(
  doc: JSONDocument<T>,
  options: CreateDocumentPersistenceOptions,
): DocumentPersistence<T> {
  const codec = options.codec ?? defaultDocumentPersistenceCodec;
  const { key } = options;

  const save = async (): Promise<DocumentPersistenceSaveResult> => {
    const host = resolveWriteHost(options.host);
    if (!host.ok) return host;

    const savedAt = new Date().toISOString();
    const snapshot: DocumentPersistencePayload = {
      value: doc.value,
      selection: doc.selection?.snapshot() ?? null,
      savedAt,
    };
    const encoded = encodeSnapshot(codec, snapshot);
    if (!encoded.ok) return encoded;

    try {
      await host.write(key, encoded.text);
      return {
        ok: true,
        key,
        savedAt,
        selectionSaved: snapshot.selection !== null,
      };
    } catch (cause) {
      return persistenceError("persistence_write_failed", "failed to write persisted document", cause);
    }
  };

  const readSnapshot = async (): Promise<SnapshotReadResult> => {
    const host = resolveReadHost(options.host);
    if (!host.ok) return host;

    try {
      const text = await host.read(key);
      if (text == null) return persistenceError("persistence_empty", "no persisted document exists");
      return decodeSnapshot(codec, text);
    } catch (cause) {
      return persistenceError("persistence_read_failed", "failed to read persisted document", cause);
    }
  };

  const clear = async (): Promise<DocumentPersistenceClearResult> => {
    const host = resolveRemoveHost(options.host);
    if (!host.ok) return host;

    try {
      await host.remove(key);
      return { ok: true, key };
    } catch (cause) {
      return persistenceError("persistence_remove_failed", "failed to remove persisted document", cause);
    }
  };

  return {
    save,

    async restore(restoreOptions = {}) {
      const snapshot = await readSnapshot();
      if (!snapshot.ok) return snapshot;

      let loaded: JSONResult;
      try {
        loaded = loadDocument(doc, snapshot.snapshot.value, restoreOptions.preserveHistory === true);
      } catch (cause) {
        return persistenceError("persistence_restore_failed", "failed to restore persisted document", cause);
      }
      if (!loaded.ok) return loadError(loaded);

      const selection = snapshot.snapshot.selection;
      const shouldRestoreSelection =
        restoreOptions.restoreSelection === true
        && selection !== null
        && doc.selection !== undefined;
      if (shouldRestoreSelection) {
        try {
          doc.selection.restore(selection);
        } catch (cause) {
          return persistenceError("persistence_restore_failed", "failed to restore persisted selection", cause);
        }
      }

      return {
        ok: true,
        key,
        value: doc.value,
        savedAt: snapshot.snapshot.savedAt,
        selectionSaved: selection !== null,
        selectionRestored: shouldRestoreSelection,
      };
    },

    watch(watchOptions = {}) {
      let active = true;
      let queue = Promise.resolve();
      const enqueue = (event: DocumentPersistenceWatchEvent): void => {
        queue = queue
          .then(async () => {
            if (!active) return;
            const result = await save();
            watchOptions.onSave?.(result, event);
          })
          .catch((cause: unknown) => {
            watchOptions.onSave?.(
              persistenceError("persistence_write_failed", "failed to write persisted document", cause),
              event,
            );
          });
      };

      if (watchOptions.immediate === true) enqueue({ applied: [] });
      const unsubscribe = doc.subscribe((applied, metadata) => {
        enqueue(watchEvent(applied, metadata));
      });

      return () => {
        active = false;
        unsubscribe();
      };
    },

    clear,
  };
}

function resolveReadHost(host?: DocumentPersistenceHost): { ok: true; read: (key: string) => MaybePromise<string | null | undefined> } | DocumentPersistenceError {
  const resolved = host ?? getLocalStorageHost();
  if (typeof resolved?.read === "function") return { ok: true, read: resolved.read.bind(resolved) };
  if (typeof resolved?.getItem === "function") return { ok: true, read: resolved.getItem.bind(resolved) };
  return persistenceError("persistence_unavailable", "document persistence read is unavailable");
}

function resolveWriteHost(host?: DocumentPersistenceHost): { ok: true; write: (key: string, value: string) => MaybePromise<void> } | DocumentPersistenceError {
  const resolved = host ?? getLocalStorageHost();
  if (typeof resolved?.write === "function") return { ok: true, write: resolved.write.bind(resolved) };
  if (typeof resolved?.setItem === "function") return { ok: true, write: resolved.setItem.bind(resolved) };
  return persistenceError("persistence_unavailable", "document persistence write is unavailable");
}

function resolveRemoveHost(host?: DocumentPersistenceHost): { ok: true; remove: (key: string) => MaybePromise<void> } | DocumentPersistenceError {
  const resolved = host ?? getLocalStorageHost();
  if (typeof resolved?.remove === "function") return { ok: true, remove: resolved.remove.bind(resolved) };
  if (typeof resolved?.removeItem === "function") return { ok: true, remove: resolved.removeItem.bind(resolved) };
  return persistenceError("persistence_unavailable", "document persistence remove is unavailable");
}

function getLocalStorageHost(): DocumentPersistenceHost | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function encodeSnapshot(
  codec: DocumentPersistenceCodec,
  snapshot: DocumentPersistencePayload,
): { ok: true; text: string } | DocumentPersistenceError {
  try {
    return { ok: true, text: codec.encode(snapshot) };
  } catch (cause) {
    return persistenceError("persistence_serialize_failed", "failed to serialize persisted document", cause);
  }
}

function decodeSnapshot(codec: DocumentPersistenceCodec, text: string): SnapshotReadResult {
  try {
    return { ok: true, snapshot: normalizePersistencePayload(codec.decode(text)) };
  } catch (cause) {
    return persistenceError("persistence_parse_failed", "failed to parse persisted document", cause);
  }
}

function loadDocument<T>(
  doc: JSONDocument<T>,
  value: unknown,
  preserveHistory: boolean,
): JSONResult {
  try {
    return doc.load(value, { preserveHistory });
  } catch (cause) {
    if (cause instanceof JSONCrudError) return cause.result;
    throw cause;
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

function normalizeSelection(value: unknown): SelectionSnap | null {
  if (!isSelectionSnap(value)) return null;
  const snapshot: SelectionSnap = {
    selectedPointers: [...value.selectedPointers],
    selectionRanges: value.selectionRanges.map((range) => ({
      anchor: cloneSelectionPoint(range.anchor),
      focus: cloneSelectionPoint(range.focus),
    })),
    primaryIndex: value.primaryIndex,
    anchor: value.anchor === null ? null : cloneSelectionPoint(value.anchor),
    focus: value.focus === null ? null : cloneSelectionPoint(value.focus),
  };
  if (value.context === undefined) return snapshot;
  return { ...snapshot, context: value.context };
}

function isSelectionSnap(value: unknown): value is SelectionSnap {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    selectedPointers?: unknown;
    selectionRanges?: unknown;
    primaryIndex?: unknown;
    anchor?: unknown;
    focus?: unknown;
  };
  return Array.isArray(candidate.selectedPointers)
    && candidate.selectedPointers.every((pointer) => typeof pointer === "string")
    && Array.isArray(candidate.selectionRanges)
    && candidate.selectionRanges.every(isSelectionRange)
    && typeof candidate.primaryIndex === "number"
    && (candidate.anchor === null || isSelectionPoint(candidate.anchor))
    && (candidate.focus === null || isSelectionPoint(candidate.focus));
}

function isSelectionRange(value: unknown): value is { anchor: SelectionPoint; focus: SelectionPoint } {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { anchor?: unknown; focus?: unknown };
  return isSelectionPoint(candidate.anchor) && isSelectionPoint(candidate.focus);
}

function isSelectionPoint(value: unknown): value is SelectionPoint {
  if (typeof value === "string") return true;
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as { path?: unknown }).path === "string";
}

function cloneSelectionPoint(point: SelectionPoint): SelectionPoint {
  return typeof point === "string" ? point : { ...point };
}

function watchEvent(
  applied: ReadonlyArray<JSONPatchOperation>,
  metadata?: JSONChangeMetadata,
): DocumentPersistenceWatchEvent {
  const event: DocumentPersistenceWatchEvent = { applied };
  if (metadata !== undefined) event.metadata = metadata;
  return event;
}

function loadError(result: Extract<JSONResult, { ok: false }>): DocumentPersistenceLoadError {
  return {
    ...result,
    message: result.reason ?? result.code,
  };
}

function persistenceError(
  code: DocumentPersistenceErrorCode,
  reason: string,
  cause?: unknown,
): DocumentPersistenceError {
  if (cause === undefined) return { ok: false, code, reason, message: reason };
  return { ok: false, code, reason, message: reason, cause };
}
