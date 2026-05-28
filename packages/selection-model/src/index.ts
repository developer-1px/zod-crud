import type {
  JSONDocument,
  Pointer,
  SelectionSnap,
} from "zod-crud";

export type SelectionModelErrorCode =
  | "selection_unavailable"
  | "invalid_pointer"
  | "path_not_found"
  | "read_failed";

export interface SelectionModelError {
  ok: false;
  code: SelectionModelErrorCode;
  reason?: string;
  pointer?: Pointer;
}

export interface SelectionModelValue {
  path: Pointer;
  value: unknown;
}

export type SelectionModelSnapshot =
  | {
      ok: true;
      pointers: ReadonlyArray<Pointer>;
      primaryPointer: Pointer | null;
      values: ReadonlyArray<SelectionModelValue>;
      selection: SelectionSnap;
    }
  | SelectionModelError;

export type SelectionModelCapabilityResult = { ok: true } | SelectionModelError;
export type SelectionModelResult = SelectionModelSnapshot;

export interface SelectionModel {
  current(): SelectionModelSnapshot;
  canSelect(pointer: Pointer): SelectionModelCapabilityResult;
  select(pointer: Pointer): SelectionModelResult;
  canSelectMany(pointers: ReadonlyArray<Pointer>): SelectionModelCapabilityResult;
  selectMany(pointers: ReadonlyArray<Pointer>): SelectionModelResult;
  canToggle(pointer: Pointer): SelectionModelCapabilityResult;
  toggle(pointer: Pointer): SelectionModelResult;
  canClear(): SelectionModelCapabilityResult;
  clear(): SelectionModelResult;
  subscribe(listener: (snapshot: SelectionModelSnapshot) => void): () => void;
  dispose(): void;
}

export function createSelectionModel<T>(
  doc: JSONDocument<T>,
): SelectionModel {
  let disposed = false;
  const listeners = new Set<(snapshot: SelectionModelSnapshot) => void>();
  const current = (): SelectionModelSnapshot => readSelectionSnapshot(doc);

  const canSelect = (pointer: Pointer): SelectionModelCapabilityResult => {
    if (doc.selection === undefined) {
      return selectionError("selection_unavailable", "document selection is not enabled", {});
    }
    const read = doc.at(pointer);
    if (!read.ok) return selectionError(read.code, read.reason, { pointer: read.pointer });
    return { ok: true };
  };

  const canSelectMany = (pointers: ReadonlyArray<Pointer>): SelectionModelCapabilityResult => {
    if (doc.selection === undefined) {
      return selectionError("selection_unavailable", "document selection is not enabled", {});
    }
    for (const pointer of pointers) {
      const capability = canSelect(pointer);
      if (!capability.ok) return capability;
    }
    return { ok: true };
  };

  const canClear = (): SelectionModelCapabilityResult => doc.selection === undefined
    ? selectionError("selection_unavailable", "document selection is not enabled", {})
    : { ok: true };

  const unsubscribeSelection = doc.selection?.subscribe(() => {
    emit(listeners, readSelectionSnapshot(doc));
  }) ?? (() => {});

  return {
    current,
    canSelect,
    select(pointer) {
      const capability = canSelect(pointer);
      if (!capability.ok) return capability;
      doc.selection?.collapse(pointer);
      return current();
    },
    canSelectMany,
    selectMany(pointers) {
      const capability = canSelectMany(pointers);
      if (!capability.ok) return capability;
      doc.selection?.selectRanges(pointers);
      return current();
    },
    canToggle: canSelect,
    toggle(pointer) {
      const capability = canSelect(pointer);
      if (!capability.ok) return capability;
      doc.selection?.togglePointer(pointer);
      return current();
    },
    canClear,
    clear() {
      const capability = canClear();
      if (!capability.ok) return capability;
      doc.selection?.empty();
      return current();
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
      unsubscribeSelection();
      listeners.clear();
    },
  };
}

function readSelectionSnapshot<T>(
  doc: JSONDocument<T>,
): SelectionModelSnapshot {
  const selection = doc.selection;
  if (selection === undefined) {
    return selectionError("selection_unavailable", "document selection is not enabled", {});
  }

  const values: SelectionModelValue[] = [];
  for (const pointer of selection.selectedPointers) {
    const read = doc.at(pointer);
    if (!read.ok) return selectionError("read_failed", read.reason, { pointer: read.pointer });
    values.push({
      path: read.path,
      value: cloneJson(read.value),
    });
  }

  return {
    ok: true,
    pointers: [...selection.selectedPointers],
    primaryPointer: selection.primaryPointer,
    values,
    selection: selection.snapshot(),
  };
}

function emit(
  listeners: Set<(snapshot: SelectionModelSnapshot) => void>,
  snapshot: SelectionModelSnapshot,
): void {
  const event = copySnapshot(snapshot);
  for (const listener of [...listeners]) {
    listener(event);
  }
}

function copySnapshot(snapshot: SelectionModelSnapshot): SelectionModelSnapshot {
  if (!snapshot.ok) return { ...snapshot };

  return {
    ...snapshot,
    pointers: [...snapshot.pointers],
    values: snapshot.values.map((entry) => ({
      path: entry.path,
      value: cloneJson(entry.value),
    })),
    selection: {
      ...snapshot.selection,
      selectedPointers: [...snapshot.selection.selectedPointers],
      selectionRanges: snapshot.selection.selectionRanges.map((range) => ({ ...range })),
    },
  };
}

function cloneJson(value: unknown): unknown {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function selectionError(
  code: SelectionModelErrorCode,
  reason: string | undefined,
  detail: { pointer?: Pointer },
): SelectionModelError {
  const error: SelectionModelError = { ok: false, code };
  if (reason !== undefined) error.reason = reason;
  if (detail.pointer !== undefined) error.pointer = detail.pointer;
  return error;
}
