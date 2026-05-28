import type {
  JSONCapabilityResult,
  JSONDocument,
  JSONResult,
  Pointer,
} from "zod-crud";

export type RecordIndexKey = string | number;

export type RecordIndexDuplicatePolicy = "error" | "first" | "last";

export interface CreateRecordIndexOptions {
  query: string;
  key: string;
  duplicate?: RecordIndexDuplicatePolicy;
}

export interface RecordIndexEntry<TValue = Record<string, unknown>> {
  key: RecordIndexKey;
  path: Pointer;
  value: TValue;
}

export type RecordIndexErrorCode =
  | "syntax_error"
  | "query_failed"
  | "read_failed"
  | "not_record"
  | "missing_key"
  | "duplicate_key"
  | "key_not_found";

export interface RecordIndexError {
  ok: false;
  code: RecordIndexErrorCode;
  reason?: string;
  key?: RecordIndexKey;
  pointer?: Pointer;
}

export type RecordIndexSnapshot<TValue = Record<string, unknown>> =
  | {
      ok: true;
      query: string;
      key: string;
      entries: ReadonlyArray<RecordIndexEntry<TValue>>;
      keys: ReadonlyArray<RecordIndexKey>;
    }
  | RecordIndexError;

export type RecordIndexPointerResult =
  | { ok: true; key: RecordIndexKey; path: Pointer }
  | RecordIndexError;

export type RecordIndexReadResult<TValue = Record<string, unknown>> =
  | { ok: true; key: RecordIndexKey; path: Pointer; value: TValue }
  | RecordIndexError;

export type RecordIndexCapabilityResult = JSONCapabilityResult | RecordIndexError;
export type RecordIndexReplaceResult =
  | JSONResult
  | RecordIndexError
  | Exclude<JSONCapabilityResult, { ok: true }>;

export interface RecordIndex<TValue = Record<string, unknown>> {
  current(): RecordIndexSnapshot<TValue>;
  refresh(): RecordIndexSnapshot<TValue>;
  entries(): ReadonlyArray<RecordIndexEntry<TValue>>;
  pointerFor(key: RecordIndexKey): RecordIndexPointerResult;
  get(key: RecordIndexKey): RecordIndexReadResult<TValue>;
  canReplace(key: RecordIndexKey, value: unknown): RecordIndexCapabilityResult;
  replace(key: RecordIndexKey, value: unknown): RecordIndexReplaceResult;
  subscribe(listener: (snapshot: RecordIndexSnapshot<TValue>) => void): () => void;
  dispose(): void;
}

export function createRecordIndex<TDocument, TValue = Record<string, unknown>>(
  doc: JSONDocument<TDocument>,
  options: CreateRecordIndexOptions,
): RecordIndex<TValue> {
  const listeners = new Set<(snapshot: RecordIndexSnapshot<TValue>) => void>();
  let disposed = false;
  let snapshot = readRecordIndex<TDocument, TValue>(doc, options);

  const current = (): RecordIndexSnapshot<TValue> => copySnapshot(snapshot);

  const refresh = (): RecordIndexSnapshot<TValue> => {
    if (disposed) return current();

    const next = readRecordIndex<TDocument, TValue>(doc, options);
    if (sameSnapshot(snapshot, next)) return current();

    snapshot = next;
    emit(listeners, snapshot);
    return current();
  };

  const entries = (): ReadonlyArray<RecordIndexEntry<TValue>> => {
    const snap = current();
    return snap.ok ? snap.entries : [];
  };

  const pointerFor = (key: RecordIndexKey): RecordIndexPointerResult => {
    const snap = current();
    if (!snap.ok) return snap;
    const entry = snap.entries.find((candidate) => candidate.key === key);
    if (!entry) return indexError("key_not_found", `record key not found: ${String(key)}`, { key });
    return { ok: true, key, path: entry.path };
  };

  const get = (key: RecordIndexKey): RecordIndexReadResult<TValue> => {
    const snap = current();
    if (!snap.ok) return snap;
    const entry = snap.entries.find((candidate) => candidate.key === key);
    if (!entry) return indexError("key_not_found", `record key not found: ${String(key)}`, { key });
    return { ok: true, key, path: entry.path, value: entry.value };
  };

  const canReplace = (key: RecordIndexKey, value: unknown): RecordIndexCapabilityResult => {
    const pointer = pointerFor(key);
    if (!pointer.ok) return pointer;
    return doc.canReplace(pointer.path, value);
  };

  const replace = (key: RecordIndexKey, value: unknown): RecordIndexReplaceResult => {
    const pointer = pointerFor(key);
    if (!pointer.ok) return pointer;
    return doc.replace(pointer.path, value);
  };

  const unsubscribeDocument = doc.subscribe(() => {
    refresh();
  });

  return {
    current,
    refresh,
    entries,
    pointerFor,
    get,
    canReplace,
    replace,
    subscribe(listener) {
      if (disposed) return () => {};

      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;

      disposed = true;
      unsubscribeDocument();
      listeners.clear();
    },
  };
}

function readRecordIndex<TDocument, TValue>(
  doc: JSONDocument<TDocument>,
  options: CreateRecordIndexOptions,
): RecordIndexSnapshot<TValue> {
  const capability = doc.canFind(options.query);
  if (!capability.ok) {
    return indexError("syntax_error", capability.reason, {});
  }

  const queried = doc.query(options.query);
  if (!queried.ok) {
    return indexError("query_failed", queried.reason, {});
  }

  const byKey = new Map<RecordIndexKey, RecordIndexEntry<TValue>>();
  const duplicateKeys = new Set<RecordIndexKey>();
  const policy = options.duplicate ?? "error";

  for (const pointer of queried.pointers) {
    const read = doc.at(pointer);
    if (!read.ok) {
      return indexError("read_failed", read.reason, { pointer });
    }
    if (!isRecord(read.value)) {
      return indexError("not_record", `query result is not an object record: ${pointer}`, { pointer });
    }

    const keyValue = read.value[options.key];
    if (typeof keyValue !== "string" && typeof keyValue !== "number") {
      return indexError("missing_key", `record key is missing or not string/number: ${options.key}`, { pointer });
    }

    if (byKey.has(keyValue)) {
      duplicateKeys.add(keyValue);
      if (policy === "first") continue;
    }

    byKey.set(keyValue, {
      key: keyValue,
      path: read.path,
      value: cloneJson(read.value) as TValue,
    });
  }

  const firstDuplicate = duplicateKeys.values().next().value as RecordIndexKey | undefined;
  if (policy === "error" && firstDuplicate !== undefined) {
    return indexError("duplicate_key", `duplicate record key: ${String(firstDuplicate)}`, { key: firstDuplicate });
  }

  const entries = [...byKey.values()];
  return {
    ok: true,
    query: options.query,
    key: options.key,
    entries,
    keys: entries.map((entry) => entry.key),
  };
}

function emit<TValue>(
  listeners: Set<(snapshot: RecordIndexSnapshot<TValue>) => void>,
  snapshot: RecordIndexSnapshot<TValue>,
): void {
  const event = copySnapshot(snapshot);
  for (const listener of [...listeners]) {
    listener(event);
  }
}

function copySnapshot<TValue>(
  snapshot: RecordIndexSnapshot<TValue>,
): RecordIndexSnapshot<TValue> {
  if (!snapshot.ok) return { ...snapshot };

  return {
    ...snapshot,
    entries: snapshot.entries.map((entry) => ({
      ...entry,
      value: cloneJson(entry.value) as TValue,
    })),
    keys: [...snapshot.keys],
  };
}

function sameSnapshot<TValue>(
  left: RecordIndexSnapshot<TValue>,
  right: RecordIndexSnapshot<TValue>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson(value: unknown): unknown {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function indexError(
  code: RecordIndexErrorCode,
  reason: string | undefined,
  detail: { key?: RecordIndexKey; pointer?: Pointer },
): RecordIndexError {
  const error: RecordIndexError = { ok: false, code };
  if (reason !== undefined) error.reason = reason;
  if (detail.key !== undefined) error.key = detail.key;
  if (detail.pointer !== undefined) error.pointer = detail.pointer;
  return error;
}
