import type {
  JSONDocument,
  JSONResult,
} from "zod-crud";

export interface DirtyStateSnapshot<T> {
  dirty: boolean;
  value: T;
  baseline: T;
}

export type DirtyStateComparator<T> = (current: T, baseline: T) => boolean;

export type DirtyStateListener<T> = (snapshot: DirtyStateSnapshot<T>) => void;

export interface CreateDirtyStateOptions<T> {
  equals?: DirtyStateComparator<T>;
}

export interface DirtyStateDiscardOptions {
  preserveHistory?: boolean;
}

export interface DirtyState<T> {
  current(): DirtyStateSnapshot<T>;
  markClean(): DirtyStateSnapshot<T>;
  isDirty(): boolean;
  discard(options?: DirtyStateDiscardOptions): JSONResult;
  subscribe(listener: DirtyStateListener<T>): () => void;
  dispose(): void;
}

export function createDirtyState<T>(
  doc: JSONDocument<T>,
  options: CreateDirtyStateOptions<T> = {},
): DirtyState<T> {
  const equals = options.equals;
  const listeners = new Set<DirtyStateListener<T>>();
  let disposed = false;
  let baseline = cloneJson(doc.value);
  let baselineSignature = jsonSignature(baseline);
  let lastSnapshotSignature = jsonSignature(readSnapshot(doc, baseline, baselineSignature, equals));

  const refresh = (): DirtyStateSnapshot<T> => {
    const snapshot = readSnapshot(doc, baseline, baselineSignature, equals);
    const signature = jsonSignature(snapshot);
    if (!disposed && signature !== lastSnapshotSignature) {
      lastSnapshotSignature = signature;
      emit(listeners, snapshot);
    }
    return copySnapshot(snapshot);
  };

  const unsubscribeDocument = doc.subscribe(refresh);

  return {
    current: () => copySnapshot(readSnapshot(doc, baseline, baselineSignature, equals)),

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

function readSnapshot<T>(
  doc: JSONDocument<T>,
  baseline: T,
  baselineSignature: string,
  equals: DirtyStateComparator<T> | undefined,
): DirtyStateSnapshot<T> {
  const value = cloneJson(doc.value);
  return {
    dirty: readDirtyValue(value, baseline, baselineSignature, equals),
    value,
    baseline: cloneJson(baseline),
  };
}

function readDirtyValue<T>(
  value: T,
  baseline: T,
  baselineSignature: string,
  equals: DirtyStateComparator<T> | undefined,
): boolean {
  if (equals !== undefined) return !equals(value, baseline);
  return jsonSignature(value) !== baselineSignature;
}

function emit<T>(
  listeners: Set<DirtyStateListener<T>>,
  snapshot: DirtyStateSnapshot<T>,
): void {
  for (const listener of [...listeners]) {
    listener(copySnapshot(snapshot));
  }
}

function copySnapshot<T>(snapshot: DirtyStateSnapshot<T>): DirtyStateSnapshot<T> {
  return {
    dirty: snapshot.dirty,
    value: cloneJson(snapshot.value),
    baseline: cloneJson(snapshot.baseline),
  };
}

function cloneJson<T>(value: T): T {
  const text = JSON.stringify(value);
  if (text === undefined) return undefined as T;
  return JSON.parse(text) as T;
}

function jsonSignature(value: unknown): string {
  const text = JSON.stringify(value);
  return text === undefined ? "undefined" : text;
}
