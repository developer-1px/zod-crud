import type {
  JSONCapabilityResult,
  JSONDocument,
  JSONResult,
} from "zod-crud";

export type CheckpointErrorCode =
  | "missing_checkpoint"
  | "restore_rejected"
  | "restore_failed";

export interface CheckpointError {
  ok: false;
  code: CheckpointErrorCode;
  reason: string;
  key?: string;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Extract<JSONResult, { ok: false }>;
}

export interface CheckpointEntry<TValue = unknown> {
  key: string;
  value: TValue;
  savedAt: number;
  label?: string;
}

export interface CheckpointsSnapshot<TValue = unknown> {
  entries: ReadonlyArray<CheckpointEntry<TValue>>;
  count: number;
}

export interface CheckpointSaveOptions {
  label?: string;
}

export interface CheckpointRestoreOptions {
  preserveHistory?: boolean;
}

export type CheckpointSaveResult<TValue = unknown> =
  | { ok: true; checkpoint: CheckpointEntry<TValue> };

export type CheckpointReadResult<TValue = unknown> =
  | { ok: true; checkpoint: CheckpointEntry<TValue> }
  | CheckpointError;

export type CheckpointRestoreResult<TValue = unknown> =
  | { ok: true; checkpoint: CheckpointEntry<TValue>; result: JSONResult }
  | CheckpointError;

export type CheckpointsListener<TValue = unknown> = (snapshot: CheckpointsSnapshot<TValue>) => void;

export interface CreateCheckpointsOptions {
  now?: () => number;
}

export interface Checkpoints<TDocument> {
  current(): CheckpointsSnapshot<TDocument>;
  list(): ReadonlyArray<CheckpointEntry<TDocument>>;
  get(key: string): CheckpointReadResult<TDocument>;
  save(key: string, options?: CheckpointSaveOptions): CheckpointSaveResult<TDocument>;
  canRestore(key: string): JSONCapabilityResult | CheckpointError;
  restore(key: string, options?: CheckpointRestoreOptions): CheckpointRestoreResult<TDocument>;
  remove(key: string): boolean;
  clear(): void;
  subscribe(listener: CheckpointsListener<TDocument>): () => void;
  dispose(): void;
}

export function createCheckpoints<TDocument>(
  doc: JSONDocument<TDocument>,
  options: CreateCheckpointsOptions = {},
): Checkpoints<TDocument> {
  const now = options.now ?? Date.now;
  const checkpoints = new Map<string, CheckpointEntry<TDocument>>();
  const listeners = new Set<CheckpointsListener<TDocument>>();
  let disposed = false;

  const emitIfChanged = (before: string): void => {
    const after = snapshotSignature(checkpoints);
    if (before === after) return;
    emit(listeners, snapshot(checkpoints));
  };

  return {
    current: () => snapshot(checkpoints),
    list: () => snapshot(checkpoints).entries,
    get(key) {
      const checkpoint = checkpoints.get(key);
      if (checkpoint === undefined) return missingCheckpoint(key);
      return { ok: true, checkpoint: copyCheckpoint(checkpoint) };
    },
    save(key, saveOptions = {}) {
      const before = snapshotSignature(checkpoints);
      const checkpoint: CheckpointEntry<TDocument> = {
        key,
        value: cloneJson(doc.value),
        savedAt: now(),
      };
      if (saveOptions.label !== undefined) checkpoint.label = saveOptions.label;
      checkpoints.set(key, checkpoint);
      emitIfChanged(before);
      return { ok: true, checkpoint: copyCheckpoint(checkpoint) };
    },
    canRestore(key) {
      const checkpoint = checkpoints.get(key);
      if (checkpoint === undefined) return missingCheckpoint(key);
      const capability = doc.canPatch({ op: "replace", path: "", value: cloneJson(checkpoint.value) });
      if (!capability.ok) return restoreRejected(key, capability);
      return capability;
    },
    restore(key, restoreOptions = {}) {
      const checkpoint = checkpoints.get(key);
      if (checkpoint === undefined) return missingCheckpoint(key);

      const capability = doc.canPatch({ op: "replace", path: "", value: cloneJson(checkpoint.value) });
      if (!capability.ok) return restoreRejected(key, capability);

      const result = doc.load(cloneJson(checkpoint.value), {
        preserveHistory: restoreOptions.preserveHistory === true,
      });
      if (!result.ok) return restoreFailed(key, result);
      return {
        ok: true,
        checkpoint: copyCheckpoint(checkpoint),
        result,
      };
    },
    remove(key) {
      const before = snapshotSignature(checkpoints);
      const removed = checkpoints.delete(key);
      if (removed) emitIfChanged(before);
      return removed;
    },
    clear() {
      const before = snapshotSignature(checkpoints);
      checkpoints.clear();
      emitIfChanged(before);
    },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}

function snapshot<TValue>(
  checkpoints: ReadonlyMap<string, CheckpointEntry<TValue>>,
): CheckpointsSnapshot<TValue> {
  const entries = [...checkpoints.values()]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(copyCheckpoint);
  return {
    entries,
    count: entries.length,
  };
}

function emit<TValue>(
  listeners: Set<CheckpointsListener<TValue>>,
  value: CheckpointsSnapshot<TValue>,
): void {
  const event = copySnapshot(value);
  for (const listener of [...listeners]) {
    listener(event);
  }
}

function copySnapshot<TValue>(
  value: CheckpointsSnapshot<TValue>,
): CheckpointsSnapshot<TValue> {
  return {
    entries: value.entries.map(copyCheckpoint),
    count: value.count,
  };
}

function copyCheckpoint<TValue>(
  checkpoint: CheckpointEntry<TValue>,
): CheckpointEntry<TValue> {
  const copied: CheckpointEntry<TValue> = {
    key: checkpoint.key,
    value: cloneJson(checkpoint.value),
    savedAt: checkpoint.savedAt,
  };
  if (checkpoint.label !== undefined) copied.label = checkpoint.label;
  return copied;
}

function missingCheckpoint(key: string): CheckpointError {
  return {
    ok: false,
    code: "missing_checkpoint",
    reason: `checkpoint not found: ${key}`,
    key,
  };
}

function restoreRejected(
  key: string,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): CheckpointError {
  return {
    ok: false,
    code: "restore_rejected",
    reason: capability.reason ?? `checkpoint restore rejected: ${key}`,
    key,
    capability,
  };
}

function restoreFailed(
  key: string,
  result: Extract<JSONResult, { ok: false }>,
): CheckpointError {
  return {
    ok: false,
    code: "restore_failed",
    reason: result.reason ?? `checkpoint restore failed: ${key}`,
    key,
    result,
  };
}

function snapshotSignature<TValue>(
  checkpoints: ReadonlyMap<string, CheckpointEntry<TValue>>,
): string {
  return JSON.stringify([...checkpoints.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
