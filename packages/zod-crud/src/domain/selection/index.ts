// SPEC §5.7 — Selection state. 정체성: "다음 명령의 작용 범위" + 캐럿 위치.
// 순수 함수. React 무관. W3C Selection API 어휘.
// DOM Selection 모델: collapsed selection (anchor === focus, ranges.length === 1) = 캐럿.
//
// 자동 규칙:
//   ① Mutation auto-select  — add/copy/move destination 모두 새 selection
//   ② Lost recovery         — 사라진 항목은 nextSibling/prev/parent 로 복구
//   ③ Index shift tracking  — 살아남은 형제 인덱스 자동 보정
//   ④ Anchor tracking       — anchor 도 동일 규칙

import { trackPointer, pickAutoTargetsInfo, pickPrimaryAutoTarget, recoverLostPointer, exists } from "../tracking/pointer.js";
import { buildPointer, isPrefix, readAt, tryParsePointer, type Pointer } from "../../foundation/json-pointer/index.js";
import type { JSONPatchOperation } from "../../foundation/json-patch/index.js";
import { cloneJson, jsonEqual, type JSONValue } from "../../foundation/json.js";
import { expandRange } from "./range.js";
import {
  cursorPoints,
  emptyTraversalPointer,
  emptyTraversalReason,
  selectionPoints,
} from "./traversal.js";
export {
  cursorPoints,
  emptyTraversalPointer,
  emptyTraversalReason,
} from "./traversal.js";

export type SelectionMode = "single" | "multiple" | "extended";
export type SelectionType = "None" | "Caret" | "Range";
export type SelectionEdge = "before" | "after";
export type SelectionAffinity = "forward" | "backward";
export type SelectionCursorDirection = "first" | "previous" | "next" | "last";
export type SelectionDirection = "forward" | "backward" | "none";
export type SelectionContext = JSONValue;
export type SelectionCursorErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "syntax_error"
  | "empty_scope"
  | "cursor_boundary";
export type SelectionScopeErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "syntax_error"
  | "empty_scope";
export type SelectionOrderErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "syntax_error"
  | "empty_scope"
  | "point_not_in_order"
  | "empty_selection";

export interface JSONPointObject {
  path: Pointer;
  offset?: number;
  edge?: SelectionEdge;
  affinity?: SelectionAffinity;
}

export type JSONPoint = Pointer | JSONPointObject;

export interface SelectionRange {
  anchor: JSONPoint;
  focus: JSONPoint;
}

export type SelectionRangeInput = JSONPoint | SelectionRange;
export type SelectionSource = Pointer | ReadonlyArray<Pointer>;

export interface SelectionCursorOptions {
  /**
   * Explicit traversal order. Use this for filtered, folded, virtualized, or
   * otherwise app-visible cursor order. When present, scope traversal is not
   * used.
   */
  points?: ReadonlyArray<JSONPoint>;
  /**
   * JSONPath query used as traversal order. Use this to move through find
   * results without precomputing `points`. Ignored when `points` is present.
   */
  query?: string;
  /** Pointer subtree used as the traversal root. Defaults to the document root. */
  scope?: Pointer;
  /** Include the scope pointer itself in traversal. Defaults to true. */
  includeScope?: boolean;
  /** Wrap next/previous at scope edges. Defaults to false. */
  wrap?: boolean;
}

export interface SelectionScopeOptions {
  /**
   * Explicit selection order. Use this for select-all over filtered, folded,
   * virtualized, or otherwise app-visible items.
   */
  points?: ReadonlyArray<JSONPoint>;
  /**
   * JSONPath query used as selection order. Use this for select-all over find
   * results without precomputing `points`. Ignored when `points` is present.
   */
  query?: string;
  /** Pointer subtree used as the selection root. Defaults to the document root. */
  scope?: Pointer;
  /** Include the scope pointer itself. Defaults to true. */
  includeScope?: boolean;
  /** Primary range index after normalization. Defaults to the last selected point. */
  primaryIndex?: number;
}

export interface SelectionOrderOptions {
  /**
   * Explicit order for comparing selection endpoints. Use this for filtered,
   * folded, virtualized, or otherwise app-visible document order.
   */
  points?: ReadonlyArray<JSONPoint>;
  /**
   * JSONPath query used as comparison order. Ignored when `points` is present.
   */
  query?: string;
  /** Pointer subtree used as the comparison root. Defaults to the document root. */
  scope?: Pointer;
  /** Include the scope pointer itself. Defaults to true. */
  includeScope?: boolean;
}

export interface SelectionSpanOptions extends SelectionOrderOptions {
  /**
   * Pointer-local length for resolving `edge: "before" | "after"` into
   * numeric offsets. String values use their current string length by default.
   */
  length?: number;
  /**
   * App-provided length resolver for non-string offset domains such as rich
   * text block paths.
   */
  getLength?: (pointer: Pointer, value: unknown) => number | null | undefined;
}

export type SelectionCursorResult =
  | {
      ok: true;
      direction: SelectionCursorDirection;
      pointer: Pointer;
      point: JSONPoint;
      previousPointer: Pointer | null;
      selection: SelectionSnap;
    }
  | {
      ok: false;
      direction: SelectionCursorDirection;
      code: SelectionCursorErrorCode;
      reason: string;
      pointer: Pointer | null;
      selection: SelectionSnap;
    };

export type SelectionCursorTarget =
  | Omit<Extract<SelectionCursorResult, { ok: true }>, "selection">
  | Omit<Extract<SelectionCursorResult, { ok: false }>, "selection">;

export type SelectionScopeResult =
  | {
      ok: true;
      points: ReadonlyArray<JSONPoint>;
      selection: SelectionSnap;
    }
  | {
      ok: false;
      code: SelectionScopeErrorCode;
      reason: string;
      pointer: Pointer | null;
      selection: SelectionSnap;
    };

export type SelectionScopeTarget =
  | Omit<Extract<SelectionScopeResult, { ok: true }>, "selection">
  | Omit<Extract<SelectionScopeResult, { ok: false }>, "selection">;

export type SelectionPointOrderResult =
  | {
      ok: true;
      order: -1 | 0 | 1;
      direction: SelectionDirection;
      left: JSONPoint;
      right: JSONPoint;
      leftPointer: Pointer;
      rightPointer: Pointer;
    }
  | {
      ok: false;
      code: SelectionOrderErrorCode;
      reason: string;
      pointer: Pointer | null;
    };

export interface OrderedSelectionRange {
  anchor: JSONPoint;
  focus: JSONPoint;
  start: JSONPoint;
  end: JSONPoint;
  direction: SelectionDirection;
  collapsed: boolean;
}

export interface OrderedSelectionRangeEntry extends OrderedSelectionRange {
  /** Original `selectionRanges` index before document-order sorting. */
  index: number;
  /** True when this entry came from `selection.primaryIndex`. */
  primary: boolean;
}

export type SelectionRangeOrderResult =
  | {
      ok: true;
      range: OrderedSelectionRange;
    }
  | {
      ok: false;
      code: SelectionOrderErrorCode;
      reason: string;
      pointer: Pointer | null;
    };

export type SelectionRangesOrderResult =
  | {
      ok: true;
      ranges: ReadonlyArray<OrderedSelectionRangeEntry>;
      primaryIndex: number;
      primaryRange: OrderedSelectionRangeEntry | null;
    }
  | {
      ok: false;
      code: SelectionOrderErrorCode;
      reason: string;
      pointer: Pointer | null;
      index: number | null;
    };

export interface SelectionPointerSpan {
  pointer: Pointer;
  rangeIndex: number;
  primary: boolean;
  start: JSONPoint;
  end: JSONPoint;
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

export interface SelectionSnap {
  selectedPointers: ReadonlyArray<Pointer>;
  selectionRanges: ReadonlyArray<SelectionRange>;
  primaryIndex: number;
  anchor: JSONPoint | null;
  focus: JSONPoint | null;
  context?: SelectionContext | undefined;
}

export const EMPTY_SELECTION: SelectionSnap = {
  selectedPointers: [],
  selectionRanges: [],
  primaryIndex: -1,
  anchor: null,
  focus: null,
};

export function isCollapsed(s: SelectionSnap): boolean {
  return s.selectionRanges.length === 1
    && s.anchor !== null
    && s.focus !== null
    && samePoint(s.anchor, s.focus);
}

export function selectionType(s: SelectionSnap): SelectionType {
  if (s.selectionRanges.length === 0) return "None";
  return isCollapsed(s) ? "Caret" : "Range";
}

export function primaryRange(s: SelectionSnap): SelectionRange | null {
  const range = s.selectionRanges[s.primaryIndex];
  return range === undefined ? null : cloneRange(range);
}

export function rangeCount(s: SelectionSnap): number {
  return s.selectionRanges.length;
}

export function selectedCount(s: SelectionSnap): number {
  return s.selectedPointers.length;
}

export function hasSelection(s: SelectionSnap): boolean {
  return selectedCount(s) > 0;
}

export function isSelected(s: SelectionSnap, pointer: Pointer): boolean {
  return s.selectedPointers.includes(pointer);
}

export function caretPoint(s: SelectionSnap): JSONPoint | null {
  return isCollapsed(s) && s.focus !== null ? clonePoint(s.focus) : null;
}

export function anchorPointer(s: SelectionSnap): Pointer | null {
  return s.anchor === null ? null : pointPath(s.anchor);
}

export function focusPointer(s: SelectionSnap): Pointer | null {
  return s.focus === null ? null : pointPath(s.focus);
}

export function selectedSource(s: SelectionSnap): SelectionSource | null {
  if (s.selectedPointers.length === 0) return null;
  return s.selectedPointers.length === 1 ? s.selectedPointers[0]! : [...s.selectedPointers];
}

export function primaryPointer(s: SelectionSnap): Pointer | null {
  const range = primaryRange(s);
  return range ? pointPath(range.focus) : null;
}

export function caretPointer(s: SelectionSnap): Pointer | null {
  const caret = caretPoint(s);
  return caret ? pointPath(caret) : null;
}

export function selectionSnapshot(s: SelectionSnap): SelectionSnap {
  const snapshot = {
    selectedPointers: [...s.selectedPointers],
    selectionRanges: s.selectionRanges.map(cloneRange),
    primaryIndex: s.primaryIndex,
    anchor: s.anchor === null ? null : clonePoint(s.anchor),
    focus: s.focus === null ? null : clonePoint(s.focus),
  };
  return s.context === undefined ? snapshot : withSelectionContext(snapshot, s.context);
}

export function restoreSelection(
  snapshot: SelectionSnap,
  mode: SelectionMode,
  state?: unknown,
): SelectionSnap {
  const snap = selectionSnapshot(snapshot);
  const restored = snap.selectionRanges.length === 0
    ? EMPTY_SELECTION
    : snapFromRanges(snap.selectionRanges, snap.primaryIndex, mode, state);
  return snap.context === undefined ? restored : withSelectionContext(restored, snap.context);
}

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
    return {
      ok: false,
      code: "invalid_pointer",
      reason: `invalid selection point pointer: ${leftPointer}`,
      pointer: leftPointer,
    };
  }
  if (tryParsePointer(rightPointer) === null) {
    return {
      ok: false,
      code: "invalid_pointer",
      reason: `invalid selection point pointer: ${rightPointer}`,
      pointer: rightPointer,
    };
  }

  if (leftPointer === rightPointer) {
    return pointOrderOk(left, right, compareSamePathPoints(left, right, state));
  }

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
    return {
      ok: false,
      code: "point_not_in_order",
      reason: `selection point is not in comparison order: ${leftPointer}`,
      pointer: leftPointer,
    };
  }
  const rightIndex = cursorPointIndex(points.points, right);
  if (rightIndex < 0) {
    return {
      ok: false,
      code: "point_not_in_order",
      reason: `selection point is not in comparison order: ${rightPointer}`,
      pointer: rightPointer,
    };
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
    return {
      ok: false,
      code: "empty_selection",
      reason: "primary selection range is empty",
      pointer: null,
    };
  }
  return orderSelectionRange(range, state, options);
}

export function orderSelectionRanges(
  selection: SelectionSnap,
  state: unknown,
  options: SelectionOrderOptions = {},
): SelectionRangesOrderResult {
  if (selection.selectionRanges.length === 0) {
    return {
      ok: false,
      code: "empty_selection",
      reason: "selection ranges are empty",
      pointer: null,
      index: null,
    };
  }

  const ranges: OrderedSelectionRangeEntry[] = [];
  for (let index = 0; index < selection.selectionRanges.length; index += 1) {
    const ordered = orderSelectionRange(selection.selectionRanges[index]!, state, options);
    if (!ordered.ok) return { ...ordered, index };
    ranges.push({
      ...ordered.range,
      index,
      primary: index === selection.primaryIndex,
    });
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

export function selectionSpansForPointer(
  selection: SelectionSnap,
  pointer: Pointer,
  state: unknown,
  options: SelectionSpanOptions = {},
): SelectionPointerSpansResult {
  if (tryParsePointer(pointer) === null) {
    return {
      ok: false,
      code: "invalid_pointer",
      reason: `invalid selection span pointer: ${pointer}`,
      pointer,
      index: null,
    };
  }
  if (selection.selectionRanges.length === 0) return { ok: true, pointer, spans: [] };
  const points = cursorPoints(state, options);
  if (!points.ok) return { ...points, index: null };
  if (!points.points.some((point) => pointPath(point) === pointer)) {
    return { ok: true, pointer, spans: [] };
  }

  const ordered = orderSelectionRanges(selection, state, options);
  if (!ordered.ok) return ordered;

  const length = pointerLength(pointer, state, options);
  const before = pointBefore(pointer);
  const after = pointAfter(pointer);
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

type SelectionShapeAction =
  | { type: "collapse"; pointer: Pointer }
  | { type: "collapse"; point: JSONPoint }
  | { type: "setBaseAndExtent"; anchor: JSONPoint; focus: JSONPoint }
  | { type: "extend"; pointer: Pointer }
  | { type: "extend"; point: JSONPoint }
  | { type: "addRange"; pointer: Pointer }
  | { type: "addRange"; point: JSONPoint }
  | { type: "addRange"; range: SelectionRange }
  | { type: "removeRange"; pointer: Pointer }
  | { type: "removeRange"; point: JSONPoint }
  | { type: "removeRange"; range: SelectionRange }
  | { type: "removeRange"; index: number }
  | { type: "toggleRange"; pointer: Pointer }
  | { type: "toggleRange"; point: JSONPoint }
  | { type: "toggleRange"; range: SelectionRange }
  | { type: "togglePointer"; pointer: Pointer }
  | {
      type: "selectRanges";
      ranges: ReadonlyArray<SelectionRangeInput>;
      anchor?: JSONPoint | null;
      focus?: JSONPoint | null;
      primaryIndex?: number;
    }
  | { type: "empty" };

export type SelectionAction =
  | (SelectionShapeAction & {
      /** JSON-serializable editing context attached to the resulting selection. */
      context?: SelectionContext;
      /** Remove existing selection context after applying this action. */
      clearContext?: boolean;
    })
  | { type: "setContext"; context: SelectionContext }
  | { type: "clearContext" };

const isMulti = (m: SelectionMode) => m === "extended" || m === "multiple";

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
    case "togglePointer":    return applyActionContext(prev, withToggledPointer(prev, action.pointer, mode, state), action);
    case "selectRanges":     return applyActionContext(prev, selectRanges(action, mode, state), action);
    case "empty":            return applyActionContext(prev, EMPTY_SELECTION, action);
    case "setContext":       return withSelectionContext(prev, action.context);
    case "clearContext":     return withoutSelectionContext(prev);
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
    point: clonePoint(point),
    previousPointer,
  };
}

export function applySelectionAutoRules(
  prev: SelectionSnap,
  applied: ReadonlyArray<JSONPatchOperation>,
  after: unknown,
  mode: SelectionMode,
): SelectionSnap {
  // 패치 안의 모든 add/copy/move destination = 새 selection (rule ①).
  let hasAutoTargetOpValue: boolean | undefined;
  const hasAutoTargetOp = (): boolean => {
    if (hasAutoTargetOpValue !== undefined) return hasAutoTargetOpValue;
    for (let index = 0; index < applied.length; index += 1) {
      const op = applied[index]!;
      if ((op.op === "add" || op.op === "copy" || op.op === "move") && op.path !== "") {
        hasAutoTargetOpValue = true;
        return true;
      }
    }
    hasAutoTargetOpValue = false;
    return false;
  };
  if (hasAutoTargetOp()) {
    if (mode === "single") {
      const target = pickPrimaryAutoTarget(applied, after);
      if (target !== null) {
        return withPreviousContext(prev, snapFromRanges([collapsedRange(target)], 0, mode, after));
      }
    }
    const autoTargets = pickAutoTargetsInfo(applied);
    if (autoTargets.targets.length > 0) {
      return withPreviousContext(prev, snapFromPointerTargets(autoTargets.targets, mode, autoTargets.unique));
    }
  }
  if (canKeepSelectionForStableReplacePatch(prev, applied)) return prev;

  // rule ②③④ — 기존 좌표를 trackPointer 또는 lost-recovery 로 따라가기.
  let stableReplacementPaths: ReadonlyArray<ReadonlyArray<string>> | null | false | undefined;
  let stableReplacementPathPointers: ReadonlyArray<Pointer> | null | false | undefined;
  let stableReplacementPointers: ReadonlySet<Pointer> | null | false | undefined;
  const getStableReplacementPaths = (): ReadonlyArray<ReadonlyArray<string>> | null | false => {
    if (stableReplacementPaths !== undefined) return stableReplacementPaths;
    const paths: string[][] = [];
    const pathPointers: Pointer[] = [];
    for (let index = 0; index < applied.length; index += 1) {
      const op = applied[index]!;
      if (op.op === "test") continue;
      if (op.op !== "replace") {
        stableReplacementPathPointers = false;
        return stableReplacementPaths = false;
      }
      const replaced = tryParsePointer(op.path);
      if (replaced === null) {
        stableReplacementPathPointers = null;
        return stableReplacementPaths = null;
      }
      paths.push(replaced);
      pathPointers.push(op.path[0] === "#" ? buildPointer(replaced) : op.path);
    }
    stableReplacementPathPointers = pathPointers;
    return stableReplacementPaths = paths;
  };
  const getStableReplacementPointers = (): ReadonlySet<Pointer> | null | false => {
    if (stableReplacementPointers !== undefined) return stableReplacementPointers;
    const paths = getStableReplacementPaths();
    if (paths === false || paths === null) return stableReplacementPointers = paths;
    const pathPointers = stableReplacementPathPointers as ReadonlyArray<Pointer>;
    const pointers = new Set<Pointer>();
    for (let index = 0; index < pathPointers.length; index += 1) {
      pointers.add(pathPointers[index]!);
    }
    return stableReplacementPointers = pointers;
  };
  const trackStableReplacementPathByScan = (
    path: Pointer,
    replacements: ReadonlyArray<ReadonlyArray<string>>,
  ): Pointer | null => {
    const target = tryParsePointer(path);
    if (target === null) return null;
    for (let index = 0; index < replacements.length; index += 1) {
      const replaced = replacements[index]!;
      if (isPrefix(replaced, target) && replaced.length < target.length) return null;
    }
    return path;
  };
  const trackStableReplacementPathBySet = (
    path: Pointer,
    replacements: ReadonlySet<Pointer>,
  ): Pointer | null => {
    if (path === "") return path;
    if (path[0] === "/") {
      if (replacements.has("")) return null;
      let slash = path.indexOf("/", 1);
      while (slash !== -1) {
        if (replacements.has(path.slice(0, slash))) return null;
        slash = path.indexOf("/", slash + 1);
      }
      return path;
    }

    const target = tryParsePointer(path);
    if (target === null) return null;
    if (replacements.has("")) return null;
    for (let length = 1; length < target.length; length += 1) {
      if (replacements.has(buildPointer(target.slice(0, length)))) return null;
    }
    return path;
  };
  let trackedPathCache: Map<Pointer, Pointer | null> | null = null;
  const trackOrRecoverPath = (path: Pointer): Pointer | null => {
    if (trackedPathCache?.has(path)) return trackedPathCache.get(path) ?? null;
    let tracked: Pointer | null;
    if (prev.selectedPointers.length > 1 || prev.selectionRanges.length > 1) {
      const replacements = getStableReplacementPointers();
      tracked = replacements === false
        ? trackPointer(path, applied)
        : replacements === null
          ? null
          : trackStableReplacementPathBySet(path, replacements);
    } else {
      const replacements = getStableReplacementPaths();
      tracked = replacements === false
        ? trackPointer(path, applied)
        : replacements === null
          ? null
          : trackStableReplacementPathByScan(path, replacements);
    }
    const next = tracked !== null && exists(after, tracked)
      ? tracked
      : recoverLostPointer(path, applied, after);
    (trackedPathCache ??= new Map()).set(path, next);
    return next;
  };
  const trackOrRecover = (p: JSONPoint | null): JSONPoint | null => {
    if (p === null) return null;
    const path = pointPath(p);
    const tracked = trackOrRecoverPath(path);
    return tracked === null ? null : withPointPath(p, tracked);
  };

  const nextRanges: SelectionRange[] = [];
  for (const range of prev.selectionRanges) {
    const anchor = trackOrRecover(range.anchor);
    const focus = trackOrRecover(range.focus);
    if (anchor !== null && focus !== null) pushUniqueRange(nextRanges, { anchor, focus });
    else if (anchor !== null || focus !== null) pushUniqueRange(nextRanges, collapsedRange(anchor ?? focus!));
  }
  const nextAnchor = trackOrRecover(prev.anchor);
  const nextFocus = trackOrRecover(prev.focus);
  const next = snapFromRanges(nextRanges, prev.primaryIndex, mode, after);
  const normalized = nextAnchor !== null && nextFocus !== null
    ? { ...next, anchor: normalizePoint(nextAnchor, after), focus: normalizePoint(nextFocus, after) }
    : next;
  const withContext = withPreviousContext(prev, normalized);
  return sameSelectionSnap(prev, withContext) ? prev : withContext;
}

function canKeepSelectionForStableReplacePatch(
  selection: SelectionSnap,
  applied: ReadonlyArray<JSONPatchOperation>,
): boolean {
  const quick = canKeepSmallStringSelectionForStableReplacePatch(selection, applied);
  if (quick !== null) return quick;

  const replacements = stableReplacementPointerSet(applied);
  if (replacements === null) return false;
  if (replacements.size === 0) return true;

  for (const pointer of selection.selectedPointers) {
    if (hasStrictReplacementAncestor(pointer, replacements)) return false;
  }
  for (const range of selection.selectionRanges) {
    if (
      pointHasStrictReplacementAncestor(range.anchor, replacements)
      || pointHasStrictReplacementAncestor(range.focus, replacements)
    ) {
      return false;
    }
  }
  return !pointHasStrictReplacementAncestor(selection.anchor, replacements)
    && !pointHasStrictReplacementAncestor(selection.focus, replacements);
}

function canKeepSmallStringSelectionForStableReplacePatch(
  selection: SelectionSnap,
  applied: ReadonlyArray<JSONPatchOperation>,
): boolean | null {
  const targets = smallStringSelectionTargets(selection);
  if (targets === null) return null;

  let sawReplacement = false;
  for (let index = 0; index < applied.length; index += 1) {
    const op = applied[index]!;
    if (op.op === "test") continue;
    if (op.op !== "replace" || typeof op.path !== "string") return false;
    const replacement = op.path[0] === "#" || op.path.includes("~") ? null : op.path;
    if (replacement === null || !isPointerLike(replacement)) return null;
    sawReplacement = true;
    for (const target of targets) {
      if (isStrictPointerPrefix(replacement, target)) return false;
    }
  }
  return sawReplacement || applied.length === 0;
}

function smallStringSelectionTargets(selection: SelectionSnap): Pointer[] | null {
  const targets: Pointer[] = [];
  const add = (point: JSONPoint | null): boolean => {
    if (point === null) return true;
    if (typeof point !== "string") return false;
    if (!targets.includes(point)) targets.push(point);
    return targets.length <= 8;
  };

  for (const pointer of selection.selectedPointers) {
    if (!add(pointer)) return null;
  }
  for (const range of selection.selectionRanges) {
    if (!add(range.anchor) || !add(range.focus)) return null;
  }
  return add(selection.anchor) && add(selection.focus) ? targets : null;
}

function isPointerLike(pointer: Pointer): boolean {
  return pointer === "" || pointer[0] === "/";
}

function isStrictPointerPrefix(prefix: Pointer, pointer: Pointer): boolean {
  return prefix === ""
    ? pointer !== ""
    : pointer.length > prefix.length
      && pointer.startsWith(prefix)
      && pointer[prefix.length] === "/";
}

function stableReplacementPointerSet(
  applied: ReadonlyArray<JSONPatchOperation>,
): Set<Pointer> | null {
  const replacements = new Set<Pointer>();
  for (let index = 0; index < applied.length; index += 1) {
    const op = applied[index]!;
    if (op.op === "test") continue;
    if (op.op !== "replace") return null;
    const segments = tryParsePointer(op.path);
    if (segments === null) return null;
    replacements.add(op.path[0] === "#" ? buildPointer(segments) : op.path);
  }
  return replacements;
}

function pointHasStrictReplacementAncestor(
  point: JSONPoint | null,
  replacements: ReadonlySet<Pointer>,
): boolean {
  if (point === null) return false;
  if (typeof point !== "string") return true;
  return hasStrictReplacementAncestor(point, replacements);
}

function hasStrictReplacementAncestor(
  pointer: Pointer,
  replacements: ReadonlySet<Pointer>,
): boolean {
  if (pointer === "") return false;
  if (pointer[0] !== "/") return true;
  if (replacements.has("")) return true;

  let slash = pointer.indexOf("/", 1);
  while (slash !== -1) {
    if (replacements.has(pointer.slice(0, slash))) return true;
    slash = pointer.indexOf("/", slash + 1);
  }
  return false;
}

function snapFromPointerTargets(
  targets: ReadonlyArray<Pointer>,
  mode: SelectionMode,
  unique = false,
): SelectionSnap {
  if (targets.length === 0) return EMPTY_SELECTION;
  if (mode === "single") {
    const target = targets[targets.length - 1]!;
    return {
      selectedPointers: [target],
      selectionRanges: [{ anchor: target, focus: target }],
      primaryIndex: 0,
      anchor: target,
      focus: target,
    };
  }

  if (unique) {
    const selectionRanges = new Array<SelectionRange>(targets.length);
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index]!;
      selectionRanges[index] = { anchor: target, focus: target };
    }
    const primary = targets[targets.length - 1]!;
    return {
      selectedPointers: targets,
      selectionRanges,
      primaryIndex: selectionRanges.length - 1,
      anchor: primary,
      focus: primary,
    };
  }

  const primaryTargetIndex = targets.length - 1;
  const selectedPointers: Pointer[] = [];
  const selectionRanges: SelectionRange[] = [];
  const indexes = new Map<Pointer, number>();
  let primaryIndex = -1;

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index]!;
    const existing = indexes.get(target);
    if (existing !== undefined) {
      if (index === primaryTargetIndex) primaryIndex = existing;
      continue;
    }

    const nextIndex = selectedPointers.length;
    indexes.set(target, nextIndex);
    selectedPointers.push(target);
    selectionRanges.push({ anchor: target, focus: target });
    if (index === primaryTargetIndex) primaryIndex = nextIndex;
  }

  if (selectionRanges.length === 0) return EMPTY_SELECTION;
  const nextPrimary = primaryIndex >= 0 ? primaryIndex : selectionRanges.length - 1;
  const primary = selectionRanges[nextPrimary]!;
  return {
    selectedPointers,
    selectionRanges,
    primaryIndex: nextPrimary,
    anchor: primary.anchor,
    focus: primary.focus,
  };
}

function pushUniqueRange(ranges: SelectionRange[], range: SelectionRange): void {
  if (!ranges.some((candidate) => sameRange(candidate, range))) ranges.push(range);
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

function normalizeRangeInput(input: SelectionRangeInput): SelectionRange {
  return isSelectionRange(input) ? input : collapsedRange(input);
}

function normalizeSelectionRange(range: SelectionRange, state?: unknown): SelectionRange {
  return {
    anchor: normalizePoint(range.anchor, state),
    focus: normalizePoint(range.focus, state),
  };
}

function normalizePoint(point: JSONPoint, state?: unknown): JSONPoint {
  if (typeof point === "string") return point;
  if (point.offset === undefined || state === undefined) return clonePoint(point);
  const segments = tryParsePointer(point.path);
  if (segments === null) return clonePoint(point);
  const value = readAt(state, segments);
  if (!value.ok || typeof value.value !== "string") return clonePoint(point);
  const offset = clampOffset(point.offset, value.value.length);
  return offset === point.offset ? clonePoint(point) : { ...point, offset };
}

function clampOffset(offset: number, max: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.min(Math.max(Math.trunc(offset), 0), max);
}

function snapFromRanges(
  input: ReadonlyArray<SelectionRange>,
  primaryIndex: number,
  mode: SelectionMode,
  state?: unknown,
): SelectionSnap {
  const normalized = normalizeRanges(input.map((range) => normalizeSelectionRange(range, state)), primaryIndex, mode);
  const selectionRanges = normalized.ranges;
  if (selectionRanges.length === 0) return EMPTY_SELECTION;
  const nextPrimary = normalized.primaryIndex;
  const primary = selectionRanges[nextPrimary]!;
  const selectedPointers = collectSelectedPointers(selectionRanges, state);
  return {
    selectedPointers,
    selectionRanges,
    primaryIndex: nextPrimary,
    anchor: primary.anchor,
    focus: primary.focus,
  };
}

function normalizeRanges(
  input: ReadonlyArray<SelectionRange>,
  primaryIndex: number,
  mode: SelectionMode,
): { ranges: SelectionRange[]; primaryIndex: number } {
  if (mode === "single") {
    const ranges = input.length > 0 ? [input[input.length - 1]!] : [];
    return { ranges, primaryIndex: ranges.length > 0 ? 0 : -1 };
  }

  const originalPrimary = clampPrimaryIndex(primaryIndex, input.length);
  const ranges: SelectionRange[] = [];
  const stringRangeIndexes = new Map<string, number>();
  let nextPrimary = -1;
  for (let i = 0; i < input.length; i += 1) {
    const range = input[i]!;
    const key = stringRangeKey(range);
    const existing = key === null
      ? ranges.findIndex((candidate) => sameRange(candidate, range))
      : stringRangeIndexes.get(key) ?? -1;
    if (existing >= 0) {
      if (i === originalPrimary) nextPrimary = existing;
      continue;
    }
    if (i === originalPrimary) nextPrimary = ranges.length;
    if (key !== null) stringRangeIndexes.set(key, ranges.length);
    ranges.push(range);
  }
  return { ranges, primaryIndex: nextPrimary >= 0 ? nextPrimary : clampPrimaryIndex(originalPrimary, ranges.length) };
}

function stringRangeKey(range: SelectionRange): string | null {
  return typeof range.anchor === "string" && typeof range.focus === "string"
    ? `${range.anchor.length}:${range.anchor}${range.focus.length}:${range.focus}`
    : null;
}

function collapsedRange(point: JSONPoint): SelectionRange {
  return { anchor: clonePoint(point), focus: clonePoint(point) };
}

function pointPath(point: JSONPoint): Pointer {
  return typeof point === "string" ? point : point.path;
}

function withPointPath(point: JSONPoint, path: Pointer): JSONPoint {
  return typeof point === "string" ? path : { ...point, path };
}

function cloneRange(range: SelectionRange): SelectionRange {
  return {
    anchor: clonePoint(range.anchor),
    focus: clonePoint(range.focus),
  };
}

function clonePoint(point: JSONPoint): JSONPoint {
  return typeof point === "string" ? point : { ...point };
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
  if (isStrictPrefix(leftSegments, rightSegments)) {
    return pointEdge(left) === "after" ? 1 : -1;
  }
  if (isStrictPrefix(rightSegments, leftSegments)) {
    return pointEdge(right) === "after" ? -1 : 1;
  }
  return null;
}

function isStrictPrefix(prefix: ReadonlyArray<string>, value: ReadonlyArray<string>): boolean {
  return prefix.length < value.length && prefix.every((segment, index) => segment === value[index]);
}

function pointEdge(point: JSONPoint): SelectionEdge | undefined {
  return typeof point === "string" ? undefined : point.edge;
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

function pointBefore(pointer: Pointer): JSONPointObject {
  return { path: pointer, edge: "before" };
}

function pointAfter(pointer: Pointer): JSONPointObject {
  return { path: pointer, edge: "after" };
}

function isBeforeBoundary(point: JSONPoint, pointer: Pointer): boolean {
  return typeof point !== "string" && point.path === pointer && point.edge === "before";
}

function isAfterBoundary(point: JSONPoint, pointer: Pointer): boolean {
  return typeof point !== "string" && point.path === pointer && point.edge === "after";
}

function pointerLength(pointer: Pointer, state: unknown, options: SelectionSpanOptions): number | null {
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

function spanOffset(point: JSONPoint, side: "start" | "end", length: number | null): number | null {
  if (typeof point === "string") return null;
  if (typeof point !== "string" && point.offset !== undefined) {
    return length === null ? Math.max(0, Math.trunc(point.offset)) : clampOffset(point.offset, length);
  }
  if (typeof point !== "string" && point.edge === "before") return 0;
  if (typeof point !== "string" && point.edge === "after") return length;
  if (length === null) return null;
  return side === "start" ? 0 : length;
}

function spanIsFull(pointer: Pointer, start: JSONPoint, end: JSONPoint, length: number | null): boolean {
  if (isBeforeBoundary(start, pointer) && isAfterBoundary(end, pointer)) return true;
  if (length === null) return false;
  return spanOffset(start, "start", length) === 0 && spanOffset(end, "end", length) === length;
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

function cursorPointIndex(points: ReadonlyArray<JSONPoint>, current: JSONPoint): number {
  const exact = points.findIndex((point) => samePoint(point, current));
  if (exact >= 0) return exact;
  const pointer = pointPath(current);
  return points.findIndex((point) => pointPath(point) === pointer);
}

function collectSelectedPointers(ranges: ReadonlyArray<SelectionRange>, state?: unknown): Pointer[] {
  const out: Pointer[] = [];
  const seen = new Set<Pointer>();
  for (const range of ranges) {
    for (const pointer of expandRange(pointPath(range.anchor), pointPath(range.focus), state)) {
      if (seen.has(pointer)) continue;
      seen.add(pointer);
      out.push(pointer);
    }
  }
  return out;
}

function clampPrimaryIndex(index: number, length: number): number {
  if (length <= 0) return -1;
  if (!Number.isFinite(index)) return length - 1;
  return Math.min(Math.max(Math.trunc(index), 0), length - 1);
}

function selectionInputMatches(candidate: SelectionRange, input: JSONPoint | SelectionRange, selectedPointers: ReadonlyArray<Pointer>): boolean {
  if (isSelectionRange(input)) return sameRange(candidate, input);
  return samePoint(candidate.anchor, input)
    || samePoint(candidate.focus, input)
    || selectedPointers.includes(pointPath(input));
}

function isSelectionRange(input: SelectionRangeInput): input is SelectionRange {
  return typeof input === "object" && "anchor" in input && "focus" in input;
}

function sameRange(left: SelectionRange, right: SelectionRange): boolean {
  return samePoint(left.anchor, right.anchor) && samePoint(left.focus, right.focus);
}

function samePoint(left: JSONPoint, right: JSONPoint): boolean {
  if (typeof left === "string" || typeof right === "string") return left === right;
  return left.path === right.path
    && left.offset === right.offset
    && left.edge === right.edge
    && left.affinity === right.affinity;
}

function sameSelectionSnap(left: SelectionSnap, right: SelectionSnap): boolean {
  return left.primaryIndex === right.primaryIndex
    && samePointOrNull(left.anchor, right.anchor)
    && samePointOrNull(left.focus, right.focus)
    && sameSelectionContext(left.context, right.context)
    && left.selectedPointers.length === right.selectedPointers.length
    && left.selectedPointers.every((p, i) => p === right.selectedPointers[i])
    && left.selectionRanges.length === right.selectionRanges.length
    && left.selectionRanges.every((range, i) => sameRange(range, right.selectionRanges[i]!));
}

function applyActionContext(
  prev: SelectionSnap,
  next: SelectionSnap,
  action: SelectionShapeAction & { context?: SelectionContext; clearContext?: boolean },
): SelectionSnap {
  const contextual = withPreviousContext(prev, next);
  if (action.clearContext === true) return withoutSelectionContext(contextual);
  if ("context" in action) return withSelectionContext(contextual, action.context);
  return contextual;
}

function withPreviousContext(prev: SelectionSnap, next: SelectionSnap): SelectionSnap {
  return prev.context === undefined ? next : withSelectionContext(next, prev.context);
}

function withSelectionContext(snap: SelectionSnap, context: SelectionContext | undefined): SelectionSnap {
  if (context === undefined) return withoutSelectionContext(snap);
  return { ...snap, context: cloneJson(context) };
}

function withoutSelectionContext(snap: SelectionSnap): SelectionSnap {
  if (snap.context === undefined) return snap;
  return {
    selectedPointers: snap.selectedPointers,
    selectionRanges: snap.selectionRanges,
    primaryIndex: snap.primaryIndex,
    anchor: snap.anchor,
    focus: snap.focus,
  };
}

function sameSelectionContext(left: SelectionContext | undefined, right: SelectionContext | undefined): boolean {
  return jsonEqual(left, right);
}

function samePointOrNull(left: JSONPoint | null, right: JSONPoint | null): boolean {
  if (left === null || right === null) return left === right;
  return samePoint(left, right);
}
