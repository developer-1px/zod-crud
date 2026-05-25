import { readAt, tryParsePointer, type Pointer } from "../../foundation/pointer/index.js";
import type {
  JSONPoint,
  SelectionEdge,
  SelectionRange,
  SelectionRangeInput,
} from "./types.js";

export function normalizeRangeInput(input: SelectionRangeInput): SelectionRange {
  return isSelectionRange(input) ? input : collapsedRange(input);
}

export function normalizeSelectionRange(range: SelectionRange, state?: unknown): SelectionRange {
  return {
    anchor: normalizePoint(range.anchor, state),
    focus: normalizePoint(range.focus, state),
  };
}

export function normalizePoint(point: JSONPoint, state?: unknown): JSONPoint {
  if (typeof point === "string") return point;
  if (point.offset === undefined || state === undefined) return clonePoint(point);
  const segments = tryParsePointer(point.path);
  if (segments === null) return clonePoint(point);
  const value = readAt(state, segments);
  if (!value.ok || typeof value.value !== "string") return clonePoint(point);
  const offset = clampOffset(point.offset, value.value.length);
  return offset === point.offset ? clonePoint(point) : { ...point, offset };
}

export function clampOffset(offset: number, max: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.min(Math.max(Math.trunc(offset), 0), max);
}

export function collapsedRange(point: JSONPoint): SelectionRange {
  return { anchor: clonePoint(point), focus: clonePoint(point) };
}

export function pointPath(point: JSONPoint): Pointer {
  return typeof point === "string" ? point : point.path;
}

export function withPointPath(point: JSONPoint, path: Pointer): JSONPoint {
  return typeof point === "string" ? path : { ...point, path };
}

export function cloneRange(range: SelectionRange): SelectionRange {
  return {
    anchor: clonePoint(range.anchor),
    focus: clonePoint(range.focus),
  };
}

export function clonePoint(point: JSONPoint): JSONPoint {
  return typeof point === "string" ? point : { ...point };
}

export function pointEdge(point: JSONPoint): SelectionEdge | undefined {
  return typeof point === "string" ? undefined : point.edge;
}

export function isSelectionRange(input: SelectionRangeInput): input is SelectionRange {
  return typeof input === "object" && "anchor" in input && "focus" in input;
}

export function sameRange(left: SelectionRange, right: SelectionRange): boolean {
  return samePoint(left.anchor, right.anchor) && samePoint(left.focus, right.focus);
}

export function samePoint(left: JSONPoint, right: JSONPoint): boolean {
  if (typeof left === "string" || typeof right === "string") return left === right;
  return left.path === right.path
    && left.offset === right.offset
    && left.edge === right.edge
    && left.affinity === right.affinity;
}
