// SPEC §5.7 — Selection state. 정체성: "다음 명령의 작용 범위" + 캐럿 위치.
// 순수 함수. React 무관. W3C Selection API 어휘.
// DOM Selection 모델: collapsed selection (anchor === focus, ranges.length === 1) = 캐럿.
//
// 자동 규칙:
//   ① Mutation auto-select  — add/copy/move destination 모두 새 selection
//   ② Lost recovery         — 사라진 항목은 nextSibling/prev/parent 로 복구
//   ③ Index shift tracking  — 살아남은 형제 인덱스 자동 보정
//   ④ Anchor tracking       — anchor 도 동일 규칙

import { trackPointer, pickAutoTargets, recoverLostPointer, exists } from "../track.js";
import { JSONPathSyntaxError, queryMatches } from "../jsonpath/index.js";
import { appendSegment, readAt, tryParsePointer, type Pointer } from "../pointer/index.js";
import type { JSONPatchOperation } from "../patch/index.js";
import { expandRange } from "./range.js";

export type SelectionMode = "single" | "multiple" | "extended";
export type SelectionType = "None" | "Caret" | "Range";
export type SelectionEdge = "before" | "after";
export type SelectionAffinity = "forward" | "backward";
export type SelectionCursorDirection = "first" | "previous" | "next" | "last";
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

export interface SelectionSnap {
  /**
   * Legacy selected-pointer list. Use `selectionRanges` for caret/range shape
   * and `selectedPointers` when item selection semantics are needed.
   */
  ranges: ReadonlyArray<Pointer>;
  selectedPointers: ReadonlyArray<Pointer>;
  selectionRanges: ReadonlyArray<SelectionRange>;
  primaryIndex: number;
  anchor: JSONPoint | null;
  focus: JSONPoint | null;
}

export const EMPTY_SELECTION: SelectionSnap = {
  ranges: [],
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

export function pointPointer(point: JSONPoint): Pointer {
  return pointPath(point);
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
  return {
    ranges: [...s.ranges],
    selectedPointers: [...s.selectedPointers],
    selectionRanges: s.selectionRanges.map(cloneRange),
    primaryIndex: s.primaryIndex,
    anchor: s.anchor === null ? null : clonePoint(s.anchor),
    focus: s.focus === null ? null : clonePoint(s.focus),
  };
}

export function restoreSelection(
  snapshot: SelectionSnap,
  mode: SelectionMode,
  state?: unknown,
): SelectionSnap {
  const snap = selectionSnapshot(snapshot);
  return snap.selectionRanges.length === 0
    ? EMPTY_SELECTION
    : snapFromRanges(snap.selectionRanges, snap.primaryIndex, mode, state);
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

export type SelectionAction =
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
  | {
      type: "selectRanges";
      ranges: ReadonlyArray<SelectionRangeInput>;
      anchor?: JSONPoint | null;
      focus?: JSONPoint | null;
      primaryIndex?: number;
    }
  | { type: "empty" };

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

export function reduceSelection(
  prev: SelectionSnap,
  action: SelectionAction,
  mode: SelectionMode,
  state?: unknown,
): SelectionSnap {
  switch (action.type) {
    case "collapse":         return snapFromRanges([collapsedRange(actionPoint(action))], 0, mode, state);
    case "setBaseAndExtent": return extentOf(mode, action.anchor, action.focus, state);
    case "extend":           return extentOf(mode, prev.anchor ?? actionPoint(action), actionPoint(action), state);
    case "addRange":         return withAdded(prev, mode, actionRange(action), state);
    case "removeRange":      return withRemoved(prev, actionRemoveTarget(action), mode, state);
    case "toggleRange": {
      const range = actionRange(action);
      return prev.selectionRanges.some((candidate) => sameRange(candidate, range))
        ? withRemoved(prev, range, mode, state)
        : withAdded(prev, mode, range, state);
    }
    case "selectRanges":     return selectRanges(action, mode, state);
    case "empty":            return EMPTY_SELECTION;
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
  const targets = pickAutoTargets(applied, after);
  if (targets.length > 0) {
    return snapFromRanges(targets.map(collapsedRange), Math.max(0, targets.length - 1), mode, after);
  }

  // rule ②③④ — 기존 좌표를 trackPointer 또는 lost-recovery 로 따라가기.
  const trackOrRecover = (p: JSONPoint | null): JSONPoint | null => {
    if (p === null) return null;
    const path = pointPath(p);
    const t = trackPointer(path, applied);
    if (t !== null && exists(after, t)) return withPointPath(p, t);
    const recovered = recoverLostPointer(path, applied, after);
    return recovered === null ? null : withPointPath(p, recovered);
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
  return sameSelectionSnap(prev, normalized) ? prev : normalized;
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
    ranges: selectedPointers,
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
  let nextPrimary = -1;
  for (let i = 0; i < input.length; i += 1) {
    const range = input[i]!;
    const existing = ranges.findIndex((candidate) => sameRange(candidate, range));
    if (existing >= 0) {
      if (i === originalPrimary) nextPrimary = existing;
      continue;
    }
    if (i === originalPrimary) nextPrimary = ranges.length;
    ranges.push(range);
  }
  return { ranges, primaryIndex: nextPrimary >= 0 ? nextPrimary : clampPrimaryIndex(originalPrimary, ranges.length) };
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

function cursorPoints(
  state: unknown,
  options: SelectionCursorOptions,
): { ok: true; points: JSONPoint[] } | { ok: false; code: "invalid_pointer" | "path_not_found" | "syntax_error"; reason: string; pointer: Pointer | null } {
  if (options.points !== undefined) {
    return explicitCursorPoints(options.points);
  }
  if (options.query !== undefined) {
    return queryCursorPoints(state, options.query);
  }

  return scopedCursorPoints(state, options.scope ?? "", options.includeScope ?? true);
}

function selectionPoints(
  state: unknown,
  options: SelectionScopeOptions,
): { ok: true; points: JSONPoint[] } | { ok: false; code: "invalid_pointer" | "path_not_found" | "syntax_error"; reason: string; pointer: Pointer | null } {
  if (options.points !== undefined) {
    return explicitCursorPoints(options.points);
  }
  if (options.query !== undefined) {
    return queryCursorPoints(state, options.query);
  }

  return scopedCursorPoints(state, options.scope ?? "", options.includeScope ?? true);
}

function explicitCursorPoints(
  points: ReadonlyArray<JSONPoint>,
): { ok: true; points: JSONPoint[] } | { ok: false; code: "invalid_pointer"; reason: string; pointer: Pointer } {
  const out: JSONPoint[] = [];
  for (const point of points) {
    const pointer = pointPath(point);
    if (tryParsePointer(pointer) === null) {
      return { ok: false, code: "invalid_pointer", reason: `invalid cursor point pointer: ${pointer}`, pointer };
    }
    if (!out.some((candidate) => samePoint(candidate, point))) out.push(clonePoint(point));
  }
  return { ok: true, points: out };
}

function queryCursorPoints(
  state: unknown,
  jsonpath: string,
): { ok: true; points: JSONPoint[] } | { ok: false; code: "invalid_pointer" | "syntax_error"; reason: string; pointer: Pointer | null } {
  try {
    return explicitCursorPoints(queryMatches(jsonpath, state).map((match) => match.pointer));
  } catch (error) {
    if (error instanceof JSONPathSyntaxError) {
      return { ok: false, code: "syntax_error", reason: error.message, pointer: null };
    }
    throw error;
  }
}

function emptyTraversalReason(
  kind: "cursor" | "selection",
  options: SelectionCursorOptions | SelectionScopeOptions,
): string {
  if (options.points !== undefined) return `${kind} points are empty`;
  if (options.query !== undefined) return `${kind} query matched no points: ${options.query}`;
  return `${kind} scope is empty: ${options.scope ?? ""}`;
}

function emptyTraversalPointer(
  options: SelectionCursorOptions | SelectionScopeOptions,
): Pointer | null {
  return options.query !== undefined ? null : options.scope ?? "";
}

function scopedCursorPoints(
  state: unknown,
  scope: Pointer,
  includeScope: boolean,
): { ok: true; points: JSONPoint[] } | { ok: false; code: "invalid_pointer" | "path_not_found"; reason: string; pointer: Pointer } {
  const segments = tryParsePointer(scope);
  if (segments === null) {
    return { ok: false, code: "invalid_pointer", reason: `invalid cursor scope pointer: ${scope}`, pointer: scope };
  }
  const value = readAt(state, segments);
  if (!value.ok) {
    return { ok: false, code: "path_not_found", reason: `cursor scope not found: ${scope}`, pointer: scope };
  }
  const pointers = collectPointers(value.value, scope);
  return { ok: true, points: includeScope ? pointers : pointers.slice(1) };
}

function collectPointers(value: unknown, base: Pointer): Pointer[] {
  const pointers: Pointer[] = [base];
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      pointers.push(...collectPointers(value[i], appendSegment(base, i)));
    }
  } else if (isObjectRecord(value)) {
    for (const key of Object.keys(value)) {
      pointers.push(...collectPointers(value[key], appendSegment(base, key)));
    }
  }
  return pointers;
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
  for (const range of ranges) {
    for (const pointer of expandRange(pointPath(range.anchor), pointPath(range.focus), state)) {
      if (!out.includes(pointer)) out.push(pointer);
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    && left.selectedPointers.length === right.selectedPointers.length
    && left.selectedPointers.every((p, i) => p === right.selectedPointers[i])
    && left.selectionRanges.length === right.selectionRanges.length
    && left.selectionRanges.every((range, i) => sameRange(range, right.selectionRanges[i]!));
}

function samePointOrNull(left: JSONPoint | null, right: JSONPoint | null): boolean {
  if (left === null || right === null) return left === right;
  return samePoint(left, right);
}
