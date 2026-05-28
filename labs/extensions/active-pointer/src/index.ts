import {
  appendSegment,
  lastSegmentIndex,
  parentPointer,
  trackPointer,
  type JSONDocument,
  type JSONPatchOperation,
  type Pointer,
} from "zod-crud";

export type ActivePointerErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "empty_active";

export interface ActivePointerError {
  ok: false;
  code: ActivePointerErrorCode;
  reason?: string;
  pointer?: Pointer;
}

export interface ActivePointerOptions {
  recover?: boolean;
}

export interface ActivePointerSnapshot {
  pointer: Pointer | null;
  lost: boolean;
}

export type ActivePointerSetResult =
  | { ok: true; snapshot: ActivePointerSnapshot }
  | ActivePointerError;

export type ActivePointerValueResult =
  | { ok: true; pointer: Pointer; value: unknown }
  | ActivePointerError;

export type ActivePointerListener = (snapshot: ActivePointerSnapshot) => void;

export interface ActivePointer {
  current(): ActivePointerSnapshot;
  canSet(pointer: Pointer): { ok: true } | ActivePointerError;
  set(pointer: Pointer): ActivePointerSetResult;
  clear(): void;
  value(): ActivePointerValueResult;
  subscribe(listener: ActivePointerListener): () => void;
  dispose(): void;
}

interface ActivePointerState {
  pointer: Pointer | null;
  lost: boolean;
}

interface NormalizedOptions {
  recover: boolean;
}

export function createActivePointer<T>(
  doc: JSONDocument<T>,
  initial?: Pointer,
  options: ActivePointerOptions = {},
): ActivePointer {
  const normalized = normalizeOptions(options);
  const state: ActivePointerState = initial === undefined
    ? { pointer: null, lost: false }
    : initialState(doc, initial);
  const listeners = new Set<ActivePointerListener>();
  let disposed = false;

  const emitIfChanged = (before: string): void => {
    const after = snapshotSignature(state);
    if (before === after) return;
    emit(listeners, snapshot(state));
  };

  const unsubscribeDocument = doc.subscribe((applied) => {
    if (disposed || applied.length === 0 || state.pointer === null) return;

    const before = snapshotSignature(state);
    const tracked = trackPointer(state.pointer, applied);
    if (tracked !== null && doc.exists(tracked)) {
      state.pointer = tracked;
      state.lost = false;
      emitIfChanged(before);
      return;
    }

    const recovered = normalized.recover
      ? recoverPointer(doc, state.pointer, applied)
      : null;
    state.pointer = recovered;
    state.lost = recovered === null;
    emitIfChanged(before);
  });

  return {
    current() {
      return snapshot(state);
    },
    canSet(pointer) {
      return canSetPointer(doc, pointer);
    },
    set(pointer) {
      const capability = canSetPointer(doc, pointer);
      if (!capability.ok) return capability;

      const before = snapshotSignature(state);
      state.pointer = pointer;
      state.lost = false;
      emitIfChanged(before);
      return { ok: true, snapshot: snapshot(state) };
    },
    clear() {
      const before = snapshotSignature(state);
      state.pointer = null;
      state.lost = false;
      emitIfChanged(before);
    },
    value() {
      if (state.pointer === null) {
        return {
          ok: false,
          code: "empty_active",
          reason: state.lost ? "active pointer was lost" : "active pointer is empty",
        };
      }
      const read = doc.at(state.pointer);
      if (!read.ok) {
        return readError(read.code, read.pointer, read.reason);
      }
      return {
        ok: true,
        pointer: read.path,
        value: cloneJson(read.value),
      };
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

function initialState<T>(
  doc: JSONDocument<T>,
  pointer: Pointer,
): ActivePointerState {
  return doc.at(pointer).ok
    ? { pointer, lost: false }
    : { pointer: null, lost: true };
}

function canSetPointer<T>(
  doc: JSONDocument<T>,
  pointer: Pointer,
): { ok: true } | ActivePointerError {
  const read = doc.at(pointer);
  if (read.ok) return { ok: true };
  return readError(read.code, read.pointer, read.reason);
}

function recoverPointer<T>(
  doc: JSONDocument<T>,
  lost: Pointer,
  applied: ReadonlyArray<JSONPatchOperation>,
): Pointer | null {
  const parent = parentPointer(lost);
  if (parent === null) return null;

  const trackedParent = trackPointer(parent, applied);
  if (trackedParent === null) return null;

  const index = lastSegmentIndex(lost);
  if (index === null) {
    return doc.exists(trackedParent) ? trackedParent : recoverExistingAncestor(doc, trackedParent);
  }

  const next = appendSegment(trackedParent, index);
  if (doc.exists(next)) return next;

  if (index > 0) {
    const previous = appendSegment(trackedParent, index - 1);
    if (doc.exists(previous)) return previous;
  }

  return recoverExistingAncestor(doc, trackedParent);
}

function recoverExistingAncestor<T>(
  doc: JSONDocument<T>,
  pointer: Pointer,
): Pointer | null {
  let current: Pointer | null = pointer;
  while (current !== null) {
    if (doc.exists(current)) return current;
    current = parentPointer(current);
  }
  return null;
}

function snapshot(state: ActivePointerState): ActivePointerSnapshot {
  return {
    pointer: state.pointer,
    lost: state.lost,
  };
}

function emit(
  listeners: Set<ActivePointerListener>,
  value: ActivePointerSnapshot,
): void {
  const event = snapshot(value);
  for (const listener of [...listeners]) {
    listener(event);
  }
}

function readError(
  code: "invalid_pointer" | "path_not_found",
  pointer: Pointer,
  reason?: string,
): ActivePointerError {
  const error: ActivePointerError = { ok: false, code, pointer };
  if (reason !== undefined) error.reason = reason;
  return error;
}

function normalizeOptions(options: ActivePointerOptions): NormalizedOptions {
  return {
    recover: options.recover !== false,
  };
}

function snapshotSignature(state: ActivePointerState): string {
  return JSON.stringify([state.pointer, state.lost]);
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}
