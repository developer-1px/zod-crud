import { readAt, tryParsePointer, type Pointer } from "../../foundation/pointer/index.js";
import { cursorPoints } from "./traversal.js";
import type {
  SelectionPoint,
  SelectionPointObject,
} from "./point.js";
import type { SelectionSnap } from "./snap.js";
import type { SelectionOrderErrorCode, SelectionOrderOptions } from "./order.js";
import {
  clampOffset,
  clonePoint,
  pointPath,
} from "./point.js";
import { compareSelectionPoints, orderSelectionRanges } from "./order.js";

export interface SelectionSpanOptions extends SelectionOrderOptions {
  length?: number;
  getLength?: (pointer: Pointer, value: unknown) => number | null | undefined;
}

export interface SelectionPointerSpan {
  pointer: Pointer;
  rangeIndex: number;
  primary: boolean;
  start: SelectionPoint;
  end: SelectionPoint;
  startOffset: number | null;
  endOffset: number | null;
  collapsed: boolean;
  full: boolean;
}

export type SelectionPointerSpansResult =
  | {
      ok: true;
      pointer: Pointer;
      spans: ReadonlyArray<SelectionPointerSpan>;
    }
  | {
      ok: false;
      code: SelectionOrderErrorCode;
      reason: string;
      pointer: Pointer | null;
      index: number | null;
    };

export function selectionSpansForPointer(
  selection: SelectionSnap,
  pointer: Pointer,
  state: unknown,
  options: SelectionSpanOptions = {},
): SelectionPointerSpansResult {
  if (tryParsePointer(pointer) === null) {
    return { ok: false, code: "invalid_pointer", reason: `invalid selection span pointer: ${pointer}`, pointer, index: null };
  }
  if (selection.selectionRanges.length === 0) return { ok: true, pointer, spans: [] };
  const points = cursorPoints(state, options);
  if (!points.ok) return { ...points, index: null };
  if (!points.points.some((point) => pointPath(point) === pointer)) return { ok: true, pointer, spans: [] };

  const ordered = orderSelectionRanges(selection, state, options);
  if (!ordered.ok) return ordered;

  const length = pointerLength(pointer, state, options);
  const before: SelectionPointObject = { path: pointer, edge: "before" };
  const after: SelectionPointObject = { path: pointer, edge: "after" };
  const spans: SelectionPointerSpan[] = [];
  for (const range of ordered.ranges) {
    const endBefore = compareSelectionPoints(range.end, before, state, options);
    if (!endBefore.ok) return { ...endBefore, index: range.index };
    if (endBefore.order <= 0) continue;

    const startAfter = compareSelectionPoints(range.start, after, state, options);
    if (!startAfter.ok) return { ...startAfter, index: range.index };
    if (startAfter.order >= 0) continue;

    const start = pointPath(range.start) === pointer ? range.start : before;
    const end = pointPath(range.end) === pointer ? range.end : after;
    const clipped = compareSelectionPoints(start, end, state, options);
    if (!clipped.ok) return { ...clipped, index: range.index };
    spans.push({
      pointer,
      rangeIndex: range.index,
      primary: range.primary,
      start: clonePoint(start),
      end: clonePoint(end),
      startOffset: spanOffset(start, "start", length),
      endOffset: spanOffset(end, "end", length),
      collapsed: clipped.order === 0,
      full: spanIsFull(pointer, start, end, length),
    });
  }

  return { ok: true, pointer, spans };
}

export function pointerLength(pointer: Pointer, state: unknown, options: SelectionSpanOptions): number | null {
  if (options.length !== undefined) return normalizeLength(options.length);
  const value = readPointerValue(state, pointer);
  const resolved = options.getLength?.(pointer, value);
  if (resolved !== undefined && resolved !== null) return normalizeLength(resolved);
  return typeof value === "string" ? value.length : null;
}

function readPointerValue(state: unknown, pointer: Pointer): unknown {
  const segments = tryParsePointer(pointer);
  if (segments === null) return undefined;
  const value = readAt(state, segments);
  return value.ok ? value.value : undefined;
}

function normalizeLength(value: number): number | null {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
}

function spanOffset(point: SelectionPoint, side: "start" | "end", length: number | null): number | null {
  if (typeof point === "string") return null;
  if (point.offset !== undefined) return length === null ? Math.max(0, Math.trunc(point.offset)) : clampOffset(point.offset, length);
  if (point.edge === "before") return 0;
  if (point.edge === "after") return length;
  if (length === null) return null;
  return side === "start" ? 0 : length;
}

function spanIsFull(pointer: Pointer, start: SelectionPoint, end: SelectionPoint, length: number | null): boolean {
  const startsBefore = typeof start !== "string" && start.path === pointer && start.edge === "before";
  const endsAfter = typeof end !== "string" && end.path === pointer && end.edge === "after";
  if (startsBefore && endsAfter) return true;
  if (length === null) return false;
  return spanOffset(start, "start", length) === 0 && spanOffset(end, "end", length) === length;
}
