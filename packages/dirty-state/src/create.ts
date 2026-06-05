import type {
  JSONDocument,
} from "zod-crud";

import {
  cloneJson,
  copySnapshot,
  jsonSignature,
  readDirtyValue,
  readSnapshot,
} from "./snapshot.js";
import type {
  CreateDirtyStateOptions,
  DirtyState,
  DirtyStateListener,
  DirtyStateSnapshot,
} from "./types.js";

export function createDirtyState<T>(
  doc: JSONDocument<T>,
  options: CreateDirtyStateOptions<T> = {},
): DirtyState<T> {
  const equals = options.equals;
  const listeners = new Set<DirtyStateListener<T>>();
  let disposed = false;
  let baseline = cloneJson(doc.value);
  let baselineSignature = jsonSignature(baseline);
  let lastSnapshotSignature = jsonSignature(readSnapshot(doc.value, baseline, baselineSignature, equals));

  const refresh = (): DirtyStateSnapshot<T> => {
    const snapshot = readSnapshot(doc.value, baseline, baselineSignature, equals);
    const signature = jsonSignature(snapshot);
    if (!disposed && signature !== lastSnapshotSignature) {
      lastSnapshotSignature = signature;
      emit(listeners, snapshot);
    }
    return copySnapshot(snapshot);
  };

  const unsubscribeDocument = doc.subscribe(refresh);

  return {
    current: () => copySnapshot(readSnapshot(doc.value, baseline, baselineSignature, equals)),

    markClean() {
      baseline = cloneJson(doc.value);
      baselineSignature = jsonSignature(baseline);
      return refresh();
    },

    isDirty: () => readDirtyValue(cloneJson(doc.value), baseline, baselineSignature, equals),

    discard(discardOptions = {}) {
      const loaded = doc.load(cloneJson(baseline), {
        preserveHistory: discardOptions.preserveHistory === true,
      });
      if (loaded.ok) refresh();
      return loaded;
    },

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

function emit<T>(
  listeners: Set<DirtyStateListener<T>>,
  snapshot: DirtyStateSnapshot<T>,
): void {
  for (const listener of [...listeners]) {
    listener(copySnapshot(snapshot));
  }
}
