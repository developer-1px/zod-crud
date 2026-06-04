import {
  trackPointer,
  type JSONDocument,
  type JSONPatchOperation,
  type Pointer,
  type SelectionPoint,
  type SelectionPointObject,
  type SelectionRange,
} from "zod-crud";

export type PresenceCursorErrorCode =
  | "empty_peer_id"
  | "empty_selection"
  | "invalid_pointer"
  | "not_found"
  | "path_not_found";

export interface PresenceCursorError {
  ok: false;
  code: PresenceCursorErrorCode;
  reason?: string;
  peerId?: string;
  pointer?: Pointer;
}

export interface PresenceCursor {
  peerId: string;
  label?: string;
  color?: string;
  selection: ReadonlyArray<SelectionRange>;
  primaryPointer: Pointer | null;
  lost: boolean;
  data?: Readonly<Record<string, unknown>>;
}

export interface PresenceCursorInput {
  peerId: string;
  label?: string;
  color?: string;
  selection: ReadonlyArray<SelectionRange>;
  data?: Readonly<Record<string, unknown>>;
}

export interface PresenceCursorUpdate {
  label?: string | null;
  color?: string | null;
  selection?: ReadonlyArray<SelectionRange>;
  data?: Readonly<Record<string, unknown>> | null;
}

export interface PresenceCursorSnapshot {
  cursors: ReadonlyArray<PresenceCursor>;
  active: number;
  lost: number;
}

export type PresenceCursorResult =
  | { ok: true; cursor: PresenceCursor }
  | PresenceCursorError;

export type PresenceCursorListener = (snapshot: PresenceCursorSnapshot) => void;

export interface LiveCursors {
  current(): PresenceCursorSnapshot;
  byPeer(peerId: string): PresenceCursor | null;
  canUpsert(input: PresenceCursorInput): { ok: true } | PresenceCursorError;
  upsert(input: PresenceCursorInput): PresenceCursorResult;
  update(peerId: string, patch: PresenceCursorUpdate): PresenceCursorResult;
  remove(peerId: string): boolean;
  clear(): void;
  subscribe(listener: PresenceCursorListener): () => void;
  dispose(): void;
}

export function createLiveCursors<T>(
  doc: JSONDocument<T>,
): LiveCursors {
  const cursors = new Map<string, PresenceCursor>();
  const listeners = new Set<PresenceCursorListener>();
  let disposed = false;

  const emitIfChanged = (before: string): void => {
    const after = snapshotSignature(cursors);
    if (before === after) return;
    const event = snapshot(cursors);
    for (const listener of [...listeners]) listener(event);
  };

  const unsubscribeDocument = doc.subscribe((applied) => {
    if (disposed || applied.length === 0 || cursors.size === 0) return;

    const before = snapshotSignature(cursors);
    for (const cursor of cursors.values()) {
      const tracked = trackSelection(doc, cursor.selection, applied);
      cursor.selection = tracked.selection;
      cursor.primaryPointer = primaryPointer(tracked.selection);
      cursor.lost = tracked.lost;
    }
    emitIfChanged(before);
  });

  return {
    current: () => snapshot(cursors),
    byPeer(peerId) {
      const cursor = cursors.get(peerId);
      return cursor === undefined ? null : copyCursor(cursor);
    },
    canUpsert: (input) => validateCursorInput(doc, input),
    upsert(input) {
      const capability = validateCursorInput(doc, input);
      if (!capability.ok) return capability;

      const before = snapshotSignature(cursors);
      const cursor = createCursor(input);
      cursors.set(input.peerId, cursor);
      emitIfChanged(before);
      return { ok: true, cursor: copyCursor(cursor) };
    },
    update(peerId, patch) {
      const cursor = cursors.get(peerId);
      if (cursor === undefined) return { ok: false, code: "not_found", peerId };

      if (patch.selection !== undefined) {
        const capability = validateSelection(doc, patch.selection, peerId);
        if (!capability.ok) return capability;
      }

      const before = snapshotSignature(cursors);
      if (hasOwn(patch, "label")) {
        if (patch.label === null) {
          delete cursor.label;
        } else if (patch.label !== undefined) {
          cursor.label = patch.label;
        }
      }
      if (hasOwn(patch, "color")) {
        if (patch.color === null) {
          delete cursor.color;
        } else if (patch.color !== undefined) {
          cursor.color = patch.color;
        }
      }
      if (patch.selection !== undefined) {
        cursor.selection = copyRanges(patch.selection);
        cursor.primaryPointer = primaryPointer(cursor.selection);
        cursor.lost = false;
      }
      if (hasOwn(patch, "data")) {
        if (patch.data === null) {
          delete cursor.data;
        } else if (patch.data !== undefined) {
          cursor.data = copyData(patch.data);
        }
      }
      emitIfChanged(before);
      return { ok: true, cursor: copyCursor(cursor) };
    },
    remove(peerId) {
      const before = snapshotSignature(cursors);
      const removed = cursors.delete(peerId);
      if (removed) emitIfChanged(before);
      return removed;
    },
    clear() {
      const before = snapshotSignature(cursors);
      cursors.clear();
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
      if (disposed) return;

      disposed = true;
      unsubscribeDocument();
      listeners.clear();
    },
  };
}

function validateCursorInput<T>(
  doc: JSONDocument<T>,
  input: PresenceCursorInput,
): { ok: true } | PresenceCursorError {
  if (input.peerId.trim().length === 0) {
    return { ok: false, code: "empty_peer_id" };
  }
  return validateSelection(doc, input.selection, input.peerId);
}

function validateSelection<T>(
  doc: JSONDocument<T>,
  selection: ReadonlyArray<SelectionRange>,
  peerId?: string,
): { ok: true } | PresenceCursorError {
  if (selection.length === 0) {
    return peerId === undefined
      ? { ok: false, code: "empty_selection" }
      : { ok: false, code: "empty_selection", peerId };
  }

  for (const range of selection) {
    for (const point of [range.anchor, range.focus]) {
      const pointer = pointPath(point);
      const read = doc.at(pointer);
      if (!read.ok) {
        return {
          ok: false,
          code: read.code,
          ...(read.reason !== undefined ? { reason: read.reason } : {}),
          ...(peerId !== undefined ? { peerId } : {}),
          pointer: read.pointer,
        };
      }
    }
  }
  return { ok: true };
}

function createCursor(input: PresenceCursorInput): PresenceCursor {
  const cursor: PresenceCursor = {
    peerId: input.peerId,
    selection: copyRanges(input.selection),
    primaryPointer: primaryPointer(input.selection),
    lost: false,
  };
  if (input.label !== undefined) cursor.label = input.label;
  if (input.color !== undefined) cursor.color = input.color;
  if (input.data !== undefined) cursor.data = copyData(input.data);
  return cursor;
}

function trackSelection<T>(
  doc: JSONDocument<T>,
  selection: ReadonlyArray<SelectionRange>,
  applied: ReadonlyArray<JSONPatchOperation>,
): { selection: SelectionRange[]; lost: boolean } {
  const tracked: SelectionRange[] = [];

  for (const range of selection) {
    const anchor = trackPoint(doc, range.anchor, applied);
    const focus = trackPoint(doc, range.focus, applied);
    if (anchor === null || focus === null) {
      return { selection: [], lost: true };
    }
    tracked.push({ anchor, focus });
  }

  return { selection: tracked, lost: false };
}

function trackPoint<T>(
  doc: JSONDocument<T>,
  point: SelectionPoint,
  applied: ReadonlyArray<JSONPatchOperation>,
): SelectionPoint | null {
  const tracked = trackPointer(pointPath(point), applied);
  if (tracked === null || !doc.exists(tracked)) return null;
  return withPointPath(point, tracked);
}

function pointPath(point: SelectionPoint): Pointer {
  return typeof point === "string" ? point : point.path;
}

function withPointPath(point: SelectionPoint, path: Pointer): SelectionPoint {
  if (typeof point === "string") return path;
  return { path, ...(point.offset === undefined ? {} : { offset: point.offset }), ...(point.edge === undefined ? {} : { edge: point.edge }), ...(point.affinity === undefined ? {} : { affinity: point.affinity }) };
}

function primaryPointer(selection: ReadonlyArray<SelectionRange>): Pointer | null {
  const first = selection[0];
  return first === undefined ? null : pointPath(first.focus);
}

function snapshot(cursors: ReadonlyMap<string, PresenceCursor>): PresenceCursorSnapshot {
  const items = list(cursors).map(copyCursor);
  return {
    cursors: items,
    active: items.filter((cursor) => !cursor.lost).length,
    lost: items.filter((cursor) => cursor.lost).length,
  };
}

function list(cursors: ReadonlyMap<string, PresenceCursor>): PresenceCursor[] {
  return [...cursors.values()].sort((left, right) => left.peerId.localeCompare(right.peerId));
}

function copyCursor(cursor: PresenceCursor): PresenceCursor {
  const copy: PresenceCursor = {
    peerId: cursor.peerId,
    selection: copyRanges(cursor.selection),
    primaryPointer: cursor.primaryPointer,
    lost: cursor.lost,
  };
  if (cursor.label !== undefined) copy.label = cursor.label;
  if (cursor.color !== undefined) copy.color = cursor.color;
  if (cursor.data !== undefined) copy.data = copyData(cursor.data);
  return copy;
}

function copyRanges(ranges: ReadonlyArray<SelectionRange>): SelectionRange[] {
  return ranges.map((range) => ({
    anchor: copyPoint(range.anchor),
    focus: copyPoint(range.focus),
  }));
}

function copyPoint(point: SelectionPoint): SelectionPoint {
  return typeof point === "string" ? point : { ...point };
}

function copyData(data: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return { ...data };
}

function snapshotSignature(cursors: ReadonlyMap<string, PresenceCursor>): string {
  return JSON.stringify(list(cursors));
}

function hasOwn<T extends object, K extends PropertyKey>(
  value: T,
  key: K,
): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}
