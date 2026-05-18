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

export interface SelectionSnap {
  ranges: ReadonlyArray<Pointer>;
  anchor: Pointer | null;
  focus: Pointer | null;
}

export const EMPTY_SELECTION: SelectionSnap = { ranges: [], anchor: null, focus: null };

export function isCollapsed(s: SelectionSnap): boolean {
  return s.ranges.length === 1 && s.anchor !== null && s.anchor === s.focus;
}

export function selectionType(s: SelectionSnap): SelectionType {
  if (s.ranges.length === 0) return "None";
  return isCollapsed(s) ? "Caret" : "Range";
}

export type SelectionAction =
  | { type: "collapse"; pointer: Pointer }
  | { type: "setBaseAndExtent"; anchor: Pointer; focus: Pointer }
  | { type: "extend"; pointer: Pointer }
  | { type: "addRange"; pointer: Pointer }
  | { type: "removeRange"; pointer: Pointer }
  | { type: "toggleRange"; pointer: Pointer }
  | { type: "selectRanges"; ranges: ReadonlyArray<Pointer>; anchor: Pointer | null; focus: Pointer | null }
  | { type: "empty" };

const isMulti = (m: SelectionMode) => m === "extended" || m === "multiple";

function extentOf(mode: SelectionMode, anchor: Pointer, focus: Pointer, state?: unknown): SelectionSnap {
  if (!isMulti(mode)) return { ranges: [focus], anchor: focus, focus };
  return { ranges: expandRange(anchor, focus, state), anchor, focus };
}

function withAdded(prev: SelectionSnap, mode: SelectionMode, p: Pointer): SelectionSnap {
  if (prev.ranges.includes(p)) return { ...prev, focus: p };
  const merged = mode === "single" ? [p] : [...prev.ranges, p];
  return { ranges: merged, anchor: prev.anchor ?? p, focus: p };
}

function withRemoved(prev: SelectionSnap, p: Pointer): SelectionSnap {
  if (!prev.ranges.includes(p)) return prev;
  const next = prev.ranges.filter((x) => x !== p);
  return {
    ranges: next,
    anchor: prev.anchor === p ? null : prev.anchor,
    focus: prev.focus === p ? next[next.length - 1] ?? null : prev.focus,
  };
}

export function reduceSelection(
  prev: SelectionSnap,
  action: SelectionAction,
  mode: SelectionMode,
  state?: unknown,
): SelectionSnap {
  switch (action.type) {
    case "collapse":         return { ranges: [action.pointer], anchor: action.pointer, focus: action.pointer };
    case "setBaseAndExtent": return extentOf(mode, action.anchor, action.focus, state);
    case "extend":           return extentOf(mode, prev.anchor ?? action.pointer, action.pointer, state);
    case "addRange":         return withAdded(prev, mode, action.pointer);
    case "removeRange":      return withRemoved(prev, action.pointer);
    case "toggleRange":      return prev.ranges.includes(action.pointer)
                               ? withRemoved(prev, action.pointer)
                               : withAdded(prev, mode, action.pointer);
    case "selectRanges":     return { ranges: limitMode(mode, action.ranges), anchor: action.anchor, focus: action.focus };
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
    const limited = limitMode(mode, targets);
    return { ranges: limited, anchor: limited[0] ?? null, focus: limited[limited.length - 1] ?? null };
  }

  // rule ②③④ — 기존 좌표를 trackPointer 또는 lost-recovery 로 따라가기.
  const trackOrRecover = (p: Pointer | null): Pointer | null => {
    if (p === null) return null;
    const t = trackPointer(p, applied);
    if (t !== null && exists(after, t)) return t;
    return recoverLostPointer(p, applied, after);
  };
  const nextRanges: Pointer[] = [];
  for (const p of prev.ranges) {
    const n = trackOrRecover(p);
    if (n !== null && !nextRanges.includes(n)) nextRanges.push(n);
  }
  const nextAnchor = trackOrRecover(prev.anchor);
  const nextFocus = trackOrRecover(prev.focus);
  // 모두 그대로면 prev 재사용해 re-render 방지
  const same = nextRanges.length === prev.ranges.length
    && nextRanges.every((p, i) => p === prev.ranges[i])
    && nextAnchor === prev.anchor
    && nextFocus === prev.focus;
  return same ? prev : { ranges: nextRanges, anchor: nextAnchor, focus: nextFocus };
}

function limitMode(mode: SelectionMode, pointers: ReadonlyArray<Pointer>): Pointer[] {
  if (mode === "single") return pointers.length > 0 ? [pointers[pointers.length - 1]!] : [];
  return [...pointers];
}
