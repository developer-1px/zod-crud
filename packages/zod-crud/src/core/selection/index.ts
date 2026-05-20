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
import type { Pointer } from "../pointer/index.js";
import type { JSONPatchOperation } from "../patch/index.js";
import { expandRange } from "./range.js";

export type SelectionMode = "single" | "multiple" | "extended";
export type SelectionType = "None" | "Caret" | "Range";
export type SelectionEdge = "before" | "after";
export type SelectionAffinity = "forward" | "backward";

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
  return s.selectionRanges[s.primaryIndex] ?? null;
}

export function caretPoint(s: SelectionSnap): JSONPoint | null {
  return isCollapsed(s) ? s.focus : null;
}

export function primaryPointer(s: SelectionSnap): Pointer | null {
  const range = primaryRange(s);
  return range ? pointPath(range.focus) : null;
}

export function caretPointer(s: SelectionSnap): Pointer | null {
  const caret = caretPoint(s);
  return caret ? pointPath(caret) : null;
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
      ranges: ReadonlyArray<Pointer | SelectionRange>;
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
    ? { ...next, anchor: nextAnchor, focus: nextFocus }
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

function normalizeRangeInput(input: Pointer | SelectionRange): SelectionRange {
  return typeof input === "string" ? collapsedRange(input) : input;
}

function snapFromRanges(
  input: ReadonlyArray<SelectionRange>,
  primaryIndex: number,
  mode: SelectionMode,
  state?: unknown,
): SelectionSnap {
  const normalized = normalizeRanges(input, primaryIndex, mode);
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
  return { anchor: point, focus: point };
}

function pointPath(point: JSONPoint): Pointer {
  return typeof point === "string" ? point : point.path;
}

function withPointPath(point: JSONPoint, path: Pointer): JSONPoint {
  return typeof point === "string" ? path : { ...point, path };
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

function isSelectionRange(input: JSONPoint | SelectionRange): input is SelectionRange {
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
    && left.selectedPointers.length === right.selectedPointers.length
    && left.selectedPointers.every((p, i) => p === right.selectedPointers[i])
    && left.selectionRanges.length === right.selectionRanges.length
    && left.selectionRanges.every((range, i) => sameRange(range, right.selectionRanges[i]!));
}

function samePointOrNull(left: JSONPoint | null, right: JSONPoint | null): boolean {
  if (left === null || right === null) return left === right;
  return samePoint(left, right);
}
