import type { Pointer } from "../../foundation/json-pointer/pointerCore.js";
import {
  cursorPoints,
  emptyTraversalPointer,
  emptyTraversalReason,
} from "./traversal.js";
import type {
  JSONPoint,
  SelectionAction,
  SelectionContext,
  SelectionCursorDirection,
  SelectionCursorOptions,
  SelectionCursorResult,
  SelectionCursorTarget,
  SelectionMode,
  SelectionRange,
  SelectionRangeInput,
  SelectionSnap,
} from "./types.js";
import { EMPTY_SELECTION } from "./types.js";
import {
  collapsedRange,
  normalizeRangeInput,
  pointPath,
  samePoint,
  sameRange,
} from "./point.js";
import { primaryPointer } from "./read.js";
import { cursorPointIndex } from "./order.js";
import {
  snapFromRanges,
  selectionSnapshot,
  withPreviousContext,
  withSelectionContext,
  withoutSelectionContext,
} from "./snap.js";

const isMulti = (m: SelectionMode) => m === "extended" || m === "multiple";

export function reduceSelection(
  prev: SelectionSnap,
  action: SelectionAction,
  mode: SelectionMode,
  state?: unknown,
): SelectionSnap {
  switch (action.type) {
    case "collapse":
      return applyActionContext(prev, snapFromRanges([collapsedRange(actionPoint(action))], 0, mode, state), action);
    case "setBaseAndExtent":
      return applyActionContext(prev, extentOf(mode, action.anchor, action.focus, state), action);
    case "extend":
      return applyActionContext(prev, extentOf(mode, prev.anchor ?? actionPoint(action), actionPoint(action), state), action);
    case "addRange":
      return applyActionContext(prev, withAdded(prev, mode, actionRange(action), state), action);
    case "removeRange":
      return applyActionContext(prev, withRemoved(prev, actionRemoveTarget(action), mode, state), action);
    case "toggleRange": {
      const range = actionRange(action);
      const next = prev.selectionRanges.some((candidate) => sameRange(candidate, range))
        ? withRemoved(prev, range, mode, state)
        : withAdded(prev, mode, range, state);
      return applyActionContext(prev, next, action);
    }
    case "togglePointer": return applyActionContext(prev, withToggledPointer(prev, action.pointer, mode, state), action);
    case "selectRanges": return applyActionContext(prev, selectRanges(action, mode, state), action);
    case "empty": return applyActionContext(prev, EMPTY_SELECTION, action);
    case "setContext": return withSelectionContext(prev, action.context);
    case "clearContext": return withoutSelectionContext(prev);
  }
}

export function moveSelectionCursor(
  prev: SelectionSnap,
  direction: SelectionCursorDirection,
  mode: SelectionMode,
  state: unknown,
  options: SelectionCursorOptions = {},
): SelectionCursorResult {
  const target = resolveSelectionCursor(prev, direction, state, options);
  if (!target.ok) return { ...target, selection: selectionSnapshot(prev) };
  const selection = reduceSelection(prev, { type: "collapse", point: target.point }, mode, state);
  return {
    ok: true,
    direction,
    pointer: target.pointer,
    point: target.point,
    previousPointer: target.previousPointer,
    selection,
  };
}

export function extendSelectionCursor(
  prev: SelectionSnap,
  direction: SelectionCursorDirection,
  mode: SelectionMode,
  state: unknown,
  options: SelectionCursorOptions = {},
): SelectionCursorResult {
  const target = resolveSelectionCursor(prev, direction, state, options);
  if (!target.ok) return { ...target, selection: selectionSnapshot(prev) };
  const selection = reduceSelection(prev, { type: "extend", point: target.point }, mode, state);
  return {
    ok: true,
    direction,
    pointer: target.pointer,
    point: target.point,
    previousPointer: target.previousPointer,
    selection,
  };
}

export function resolveSelectionCursor(
  current: SelectionSnap,
  direction: SelectionCursorDirection,
  state: unknown,
  options: SelectionCursorOptions = {},
): SelectionCursorTarget {
  const points = cursorPoints(state, options);
  if (!points.ok) {
    return {
      ok: false,
      direction,
      code: points.code,
      reason: points.reason,
      pointer: points.pointer,
    };
  }
  if (points.points.length === 0) {
    return {
      ok: false,
      direction,
      code: "empty_scope",
      reason: emptyTraversalReason("cursor", options),
      pointer: emptyTraversalPointer(options),
    };
  }

  const previousPoint = current.focus;
  const previousPointer = previousPoint === null ? primaryPointer(current) : pointPath(previousPoint);
  const previousIndex = previousPoint === null ? -1 : cursorPointIndex(points.points, previousPoint);
  const targetIndex = cursorTargetIndex(direction, previousIndex, points.points.length, options.wrap === true);
  if (targetIndex === null) {
    return {
      ok: false,
      direction,
      code: "cursor_boundary",
      reason: options.points !== undefined
        ? `cursor is at ${direction === "next" ? "last" : "first"} point`
        : `cursor is at ${direction === "next" ? "last" : "first"} pointer in scope: ${options.scope ?? ""}`,
      pointer: previousPointer,
    };
  }

  const point = points.points[targetIndex]!;
  const pointer = pointPath(point);
  return {
    ok: true,
    direction,
    pointer,
    point: typeof point === "string" ? point : { ...point },
    previousPointer,
  };
}

function extentOf(mode: SelectionMode, anchor: JSONPoint, focus: JSONPoint, state?: unknown): SelectionSnap {
  if (!isMulti(mode)) return snapFromRanges([collapsedRange(focus)], 0, mode, state);
  return snapFromRanges([{ anchor, focus }], 0, mode, state);
}

function withAdded(prev: SelectionSnap, mode: SelectionMode, range: SelectionRange, state?: unknown): SelectionSnap {
  const existing = prev.selectionRanges.findIndex((candidate) => sameRange(candidate, range));
  if (existing >= 0) return snapFromRanges(prev.selectionRanges, existing, mode, state);
  const next = mode === "single" ? [range] : [...prev.selectionRanges, range];
  return snapFromRanges(next, next.length - 1, mode, state);
}

function withRemoved(prev: SelectionSnap, input: JSONPoint | SelectionRange | number, mode: SelectionMode, state?: unknown): SelectionSnap {
  const removeAt = typeof input === "number"
    ? input
    : prev.selectionRanges.findIndex((candidate) => selectionInputMatches(candidate, input, prev.selectedPointers));
  if (removeAt < 0 || removeAt >= prev.selectionRanges.length) return prev;
  const next = prev.selectionRanges.filter((_, index) => index !== removeAt);
  return snapFromRanges(next, Math.min(prev.primaryIndex, next.length - 1), mode, state);
}

function withToggledPointer(prev: SelectionSnap, pointer: Pointer, mode: SelectionMode, state?: unknown): SelectionSnap {
  if (!prev.selectedPointers.includes(pointer)) return withAdded(prev, mode, collapsedRange(pointer), state);
  const next = prev.selectedPointers.filter((selected) => selected !== pointer);
  return snapFromRanges(next.map(collapsedRange), next.length - 1, mode, state);
}

function selectRanges(
  action: Extract<SelectionAction, { type: "selectRanges" }>,
  mode: SelectionMode,
  state?: unknown,
): SelectionSnap {
  const hasRangeObjects = action.ranges.some((range) => typeof range !== "string");
  if (!hasRangeObjects && (action.anchor !== undefined || action.focus !== undefined)) {
    const anchor = action.anchor ?? action.focus;
    const focus = action.focus ?? action.anchor;
    if (anchor === null || anchor === undefined || focus === null || focus === undefined) return EMPTY_SELECTION;
    return snapFromRanges([{ anchor, focus }], action.primaryIndex ?? 0, mode, state);
  }
  return snapFromRanges(action.ranges.map(normalizeRangeInput), action.primaryIndex ?? action.ranges.length - 1, mode, state);
}

function actionPoint(action: { pointer?: Pointer; point?: JSONPoint }): JSONPoint {
  return action.point ?? action.pointer!;
}

function actionRange(action: { pointer?: Pointer; point?: JSONPoint; range?: SelectionRange }): SelectionRange {
  return action.range ?? collapsedRange(actionPoint(action));
}

function actionRemoveTarget(action: { pointer?: Pointer; point?: JSONPoint; range?: SelectionRange; index?: number }): JSONPoint | SelectionRange | number {
  return action.index ?? action.range ?? actionPoint(action);
}

function selectionInputMatches(candidate: SelectionRange, input: JSONPoint | SelectionRange, selectedPointers: ReadonlyArray<Pointer>): boolean {
  if (typeof input === "object" && "anchor" in input && "focus" in input) return sameRange(candidate, input);
  return samePoint(candidate.anchor, input)
    || samePoint(candidate.focus, input)
    || selectedPointers.includes(pointPath(input));
}

function applyActionContext(
  prev: SelectionSnap,
  next: SelectionSnap,
  action: SelectionAction & { context?: SelectionContext; clearContext?: boolean },
): SelectionSnap {
  const contextual = withPreviousContext(prev, next);
  if (action.clearContext === true) return withoutSelectionContext(contextual);
  if ("context" in action) return withSelectionContext(contextual, action.context);
  return contextual;
}

function cursorTargetIndex(
  direction: SelectionCursorDirection,
  previousIndex: number,
  length: number,
  wrap: boolean,
): number | null {
  switch (direction) {
    case "first":
      return 0;
    case "last":
      return length - 1;
    case "next":
      if (previousIndex < 0) return 0;
      if (previousIndex < length - 1) return previousIndex + 1;
      return wrap ? 0 : null;
    case "previous":
      if (previousIndex < 0) return length - 1;
      if (previousIndex > 0) return previousIndex - 1;
      return wrap ? length - 1 : null;
  }
}
