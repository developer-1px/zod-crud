import { tryParsePointer } from "../../foundation/pointer/index.js";
import {
  cursorPoints,
  emptyTraversalPointer,
  emptyTraversalReason,
  selectionPoints,
} from "./traversal.js";
import type {
  JSONPoint,
  OrderedSelectionRangeEntry,
  SelectionMode,
  SelectionOrderOptions,
  SelectionPointOrderResult,
  SelectionRange,
  SelectionRangeOrderResult,
  SelectionRangesOrderResult,
  SelectionScopeOptions,
  SelectionScopeResult,
  SelectionScopeTarget,
  SelectionSnap,
} from "./types.js";
import {
  clonePoint,
  collapsedRange,
  normalizePoint,
  normalizeSelectionRange,
  pointEdge,
  pointPath,
  samePoint,
} from "./point.js";
import { selectionSnapshot, snapFromRanges } from "./snap.js";

export function selectSelectionScope(
  prev: SelectionSnap,
  mode: SelectionMode,
  state: unknown,
  options: SelectionScopeOptions = {},
): SelectionScopeResult {
  const points = selectionPoints(state, options);
  if (!points.ok) return { ...points, selection: selectionSnapshot(prev) };
  if (points.points.length === 0) {
    return {
      ok: false,
      code: "empty_scope",
      reason: emptyTraversalReason("selection", options),
      pointer: emptyTraversalPointer(options),
      selection: selectionSnapshot(prev),
    };
  }
  const primaryIndex = options.primaryIndex ?? points.points.length - 1;
  const selection = snapFromRanges(points.points.map(collapsedRange), primaryIndex, mode, state);
  return {
    ok: true,
    points: points.points.map(clonePoint),
    selection,
  };
}

export function resolveSelectionScope(
  state: unknown,
  options: SelectionScopeOptions = {},
): SelectionScopeTarget {
  const points = selectionPoints(state, options);
  if (!points.ok) return points;
  if (points.points.length === 0) {
    return {
      ok: false,
      code: "empty_scope",
      reason: emptyTraversalReason("selection", options),
      pointer: emptyTraversalPointer(options),
    };
  }
  return { ok: true, points: points.points.map(clonePoint) };
}

export function compareSelectionPoints(
  left: JSONPoint,
  right: JSONPoint,
  state: unknown,
  options: SelectionOrderOptions = {},
): SelectionPointOrderResult {
  const leftPointer = pointPath(left);
  const rightPointer = pointPath(right);
  if (tryParsePointer(leftPointer) === null) {
    return { ok: false, code: "invalid_pointer", reason: `invalid selection point pointer: ${leftPointer}`, pointer: leftPointer };
  }
  if (tryParsePointer(rightPointer) === null) {
    return { ok: false, code: "invalid_pointer", reason: `invalid selection point pointer: ${rightPointer}`, pointer: rightPointer };
  }

  if (leftPointer === rightPointer) return pointOrderOk(left, right, compareSamePathPoints(left, right, state));

  const boundaryOrder = compareBoundaryContainment(left, right);
  if (boundaryOrder !== null) return pointOrderOk(left, right, boundaryOrder);

  const points = cursorPoints(state, options);
  if (!points.ok) return points;
  if (points.points.length === 0) {
    return {
      ok: false,
      code: "empty_scope",
      reason: emptyTraversalReason("selection", options),
      pointer: emptyTraversalPointer(options),
    };
  }

  const leftIndex = cursorPointIndex(points.points, left);
  if (leftIndex < 0) {
    return { ok: false, code: "point_not_in_order", reason: `selection point is not in comparison order: ${leftPointer}`, pointer: leftPointer };
  }
  const rightIndex = cursorPointIndex(points.points, right);
  if (rightIndex < 0) {
    return { ok: false, code: "point_not_in_order", reason: `selection point is not in comparison order: ${rightPointer}`, pointer: rightPointer };
  }

  return pointOrderOk(left, right, compareNumbers(leftIndex, rightIndex));
}

export function orderSelectionRange(
  range: SelectionRange,
  state: unknown,
  options: SelectionOrderOptions = {},
): SelectionRangeOrderResult {
  const normalized = normalizeSelectionRange(range, state);
  const compared = compareSelectionPoints(normalized.anchor, normalized.focus, state, options);
  if (!compared.ok) return compared;
  const anchor = clonePoint(normalized.anchor);
  const focus = clonePoint(normalized.focus);
  return {
    ok: true,
    range: {
      anchor,
      focus,
      start: compared.order <= 0 ? clonePoint(normalized.anchor) : clonePoint(normalized.focus),
      end: compared.order <= 0 ? clonePoint(normalized.focus) : clonePoint(normalized.anchor),
      direction: compared.direction,
      collapsed: compared.order === 0,
    },
  };
}

export function orderPrimarySelectionRange(
  selection: SelectionSnap,
  state: unknown,
  options: SelectionOrderOptions = {},
): SelectionRangeOrderResult {
  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return { ok: false, code: "empty_selection", reason: "primary selection range is empty", pointer: null };
  }
  return orderSelectionRange(range, state, options);
}

export function orderSelectionRanges(
  selection: SelectionSnap,
  state: unknown,
  options: SelectionOrderOptions = {},
): SelectionRangesOrderResult {
  if (selection.selectionRanges.length === 0) {
    return { ok: false, code: "empty_selection", reason: "selection ranges are empty", pointer: null, index: null };
  }

  const ranges: OrderedSelectionRangeEntry[] = [];
  for (let index = 0; index < selection.selectionRanges.length; index += 1) {
    const ordered = orderSelectionRange(selection.selectionRanges[index]!, state, options);
    if (!ordered.ok) return { ...ordered, index };
    ranges.push({ ...ordered.range, index, primary: index === selection.primaryIndex });
  }

  const sorted = ranges.sort((left, right) => compareOrderedRanges(left, right, state, options));
  const primaryIndex = sorted.findIndex((range) => range.primary);
  return {
    ok: true,
    ranges: sorted,
    primaryIndex,
    primaryRange: primaryIndex < 0 ? null : sorted[primaryIndex]!,
  };
}

export function cursorPointIndex(points: ReadonlyArray<JSONPoint>, current: JSONPoint): number {
  const exact = points.findIndex((point) => samePoint(point, current));
  if (exact >= 0) return exact;
  const pointer = pointPath(current);
  return points.findIndex((point) => pointPath(point) === pointer);
}

function pointOrderOk(left: JSONPoint, right: JSONPoint, order: -1 | 0 | 1): Extract<SelectionPointOrderResult, { ok: true }> {
  return {
    ok: true,
    order,
    direction: order < 0 ? "forward" : order > 0 ? "backward" : "none",
    left: clonePoint(left),
    right: clonePoint(right),
    leftPointer: pointPath(left),
    rightPointer: pointPath(right),
  };
}

function compareSamePathPoints(left: JSONPoint, right: JSONPoint, state: unknown): -1 | 0 | 1 {
  if (samePoint(left, right)) return 0;
  const leftRank = samePathPointRank(normalizePoint(left, state));
  const rightRank = samePathPointRank(normalizePoint(right, state));
  const positionOrder = compareNumbers(leftRank.position, rightRank.position);
  return positionOrder === 0 ? compareNumbers(leftRank.edge, rightRank.edge) : positionOrder;
}

function compareBoundaryContainment(left: JSONPoint, right: JSONPoint): -1 | 1 | null {
  const leftSegments = tryParsePointer(pointPath(left));
  const rightSegments = tryParsePointer(pointPath(right));
  if (leftSegments === null || rightSegments === null) return null;
  if (isStrictPrefix(leftSegments, rightSegments)) return pointEdge(left) === "after" ? 1 : -1;
  if (isStrictPrefix(rightSegments, leftSegments)) return pointEdge(right) === "after" ? -1 : 1;
  return null;
}

function isStrictPrefix(prefix: ReadonlyArray<string>, value: ReadonlyArray<string>): boolean {
  return prefix.length < value.length && prefix.every((segment, index) => segment === value[index]);
}

function samePathPointRank(point: JSONPoint): { position: number; edge: number } {
  if (typeof point === "string") return { position: 0, edge: 0 };
  if (point.offset === undefined && point.edge === "before") return { position: Number.NEGATIVE_INFINITY, edge: 0 };
  if (point.offset === undefined && point.edge === "after") return { position: Number.POSITIVE_INFINITY, edge: 0 };
  return {
    position: point.offset === undefined || !Number.isFinite(point.offset) ? 0 : point.offset,
    edge: point.edge === "before" ? -1 : point.edge === "after" ? 1 : 0,
  };
}

function compareNumbers(left: number, right: number): -1 | 0 | 1 {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareOrderedRanges(
  left: OrderedSelectionRangeEntry,
  right: OrderedSelectionRangeEntry,
  state: unknown,
  options: SelectionOrderOptions,
): -1 | 0 | 1 {
  const start = compareSelectionPoints(left.start, right.start, state, options);
  if (start.ok && start.order !== 0) return start.order;
  const end = compareSelectionPoints(left.end, right.end, state, options);
  if (end.ok && end.order !== 0) return end.order;
  return compareNumbers(left.index, right.index);
}
