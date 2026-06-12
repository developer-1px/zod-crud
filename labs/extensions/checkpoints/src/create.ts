import type { JSONCapabilityResult, JSONDocument, JSONResult } from "@interactive-os/json-document";
import type { CheckpointEntry, CheckpointError, Checkpoints, CheckpointsListener, CheckpointsSnapshot, CreateCheckpointsOptions } from "./types.js";

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

export function snapshot<TValue>(
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
