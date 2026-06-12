import type { JSONDocument } from "@interactive-os/json-document";
import type { AutoSave, AutoSaveFlushResult, AutoSaveListener, AutoSaveOptions, AutoSaveReason, AutoSaveRuntime, AutoSaveScheduler, AutoSaveSnapshot, PendingEvent } from "./types.js";

const defaultScheduler: AutoSaveScheduler = {
  schedule(task) {
    const id = setTimeout(task, 0);
    return () => {
      clearTimeout(id);
    };
  },
};

export function createAutoSave<TValue>(
  doc: JSONDocument<TValue>,
  options: AutoSaveOptions<TValue>,
): AutoSave {
  const scheduler = options.scheduler ?? defaultScheduler;
  const listeners = new Set<AutoSaveListener>();
  const runtime: AutoSaveRuntime = {
    state: "idle",
    pending: false,
    saving: false,
    saveCount: 0,
    sequence: 0,
    lastSavedAt: null,
    error: null,
  };
  let disposed = false;
  let scheduledCancel: (() => void) | null = null;
  let latest: PendingEvent | null = null;

  const emitSnapshot = (): void => {
    emit(listeners, snapshot(runtime, disposed));
  };

  const scheduleFlush = (): void => {
    if (disposed || scheduledCancel !== null || runtime.saving) return;
    scheduledCancel = scheduler.schedule(() => {
      scheduledCancel = null;
      void flushLatest();
    });
  };

  const markPending = (event: PendingEvent): void => {
    if (disposed) return;
    latest = event;
    runtime.pending = true;
    runtime.state = runtime.saving ? "saving" : "pending";
    emitSnapshot();
    scheduleFlush();
  };

  const flushLatest = async (reason: AutoSaveReason = "change"): Promise<AutoSaveFlushResult> => {
    if (disposed) return { ok: true, snapshot: snapshot(runtime, disposed) };
    if (scheduledCancel !== null) {
      scheduledCancel();
      scheduledCancel = null;
    }
    if (runtime.saving) {
      runtime.pending = true;
      runtime.state = "saving";
      emitSnapshot();
      return { ok: true, snapshot: snapshot(runtime, disposed) };
    }

    const event = latest ?? {
      reason,
      sequence: runtime.sequence + 1,
    };
    latest = null;
    runtime.sequence = Math.max(runtime.sequence, event.sequence);
    runtime.pending = false;
    runtime.saving = true;
    runtime.state = "saving";
    runtime.error = null;
    emitSnapshot();

    try {
      const result = await options.save({
        value: cloneJson(doc.value),
        reason: event.reason,
        sequence: event.sequence,
        ...(event.applied !== undefined ? { applied: event.applied } : {}),
        ...(event.metadata !== undefined ? { metadata: event.metadata } : {}),
      });
      runtime.saving = false;
      runtime.saveCount += 1;
      runtime.lastSavedAt = typeof result === "object" && result !== null && result.savedAt !== undefined
        ? result.savedAt
        : new Date().toISOString();
      runtime.state = runtime.pending ? "pending" : "saved";
      emitSnapshot();
      if (runtime.pending) scheduleFlush();
      return { ok: true, snapshot: snapshot(runtime, disposed) };
    } catch (error) {
      runtime.saving = false;
      runtime.error = error;
      runtime.state = "error";
      emitSnapshot();
      return { ok: false, snapshot: snapshot(runtime, disposed), error };
    }
  };

  const unsubscribeDocument = doc.subscribe((applied, metadata) => {
    runtime.sequence += 1;
    markPending({
      reason: "change",
      sequence: runtime.sequence,
      applied: cloneJson(applied),
      ...(metadata !== undefined ? { metadata: cloneJson(metadata) } : {}),
    });
  });

  const api: AutoSave = {
    current: () => snapshot(runtime, disposed),
    request(reason = "manual") {
      runtime.sequence += 1;
      markPending({ reason, sequence: runtime.sequence });
    },
    flush: (reason = "manual") => flushLatest(reason),
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
      if (scheduledCancel !== null) {
        scheduledCancel();
        scheduledCancel = null;
      }
      listeners.clear();
      runtime.pending = false;
      runtime.state = "disposed";
    },
  };

  if (options.immediate === true) {
    runtime.sequence += 1;
    markPending({ reason: "start", sequence: runtime.sequence });
  }

  return api;
}

export function snapshot(runtime: AutoSaveRuntime, disposed: boolean): AutoSaveSnapshot {
  return {
    state: disposed ? "disposed" : runtime.state,
    pending: disposed ? false : runtime.pending,
    saving: disposed ? false : runtime.saving,
    saveCount: runtime.saveCount,
    sequence: runtime.sequence,
    lastSavedAt: runtime.lastSavedAt,
    error: runtime.error,
  };
}

function emit(
  listeners: Set<AutoSaveListener>,
  value: AutoSaveSnapshot,
): void {
  const event = copySnapshot(value);
  for (const listener of [...listeners]) {
    listener(event);
  }
}

function copySnapshot(value: AutoSaveSnapshot): AutoSaveSnapshot {
  return {
    state: value.state,
    pending: value.pending,
    saving: value.saving,
    saveCount: value.saveCount,
    sequence: value.sequence,
    lastSavedAt: value.lastSavedAt,
    error: value.error,
  };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
