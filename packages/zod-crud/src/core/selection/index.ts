// SPEC §5.7 — Selection state (Axis 2). 정체성: "다음 명령의 작용 범위" + 캐럿 위치.
// 순수 함수. React 무관. W3C Selection API 어휘를 따른다.
//
// DOM Selection 모델: collapsed selection (anchor === focus, ranges.length === 1) 이
// 곧 캐럿. 별도 focus 축은 없다.
//
// 자동 규칙 4 개:
//   ① Mutation auto-select  — add/copy/move 발생 시 destination 으로 collapse
//   ② Lost recovery         — 사라진 항목은 nextSibling/prev/parent 로 복구
//   ③ Index shift tracking  — 살아남은 형제 인덱스 자동 보정
//   ④ Anchor tracking       — anchor 도 동일 규칙

import { trackPointer, pickAutoTarget, recoverLostPointer, exists } from "../track.js";
import type { Pointer } from "../pointer/index.js";
import type { JsonPatchOperation } from "../patch/index.js";
import { expandRange } from "./range.js";

export type SelectionMode = "single" | "multiple" | "extended";

export type SelectionType = "None" | "Caret" | "Range";

export interface SelectionSnap {
  ranges: ReadonlyArray<Pointer>;
  anchor: Pointer | null;
  focus: Pointer | null;
}

export const EMPTY_SELECTION: SelectionSnap = { ranges: [], anchor: null, focus: null };

export function isCollapsed(snap: SelectionSnap): boolean {
  return snap.ranges.length === 1 && snap.anchor !== null && snap.anchor === snap.focus;
}

export function selectionType(snap: SelectionSnap): SelectionType {
  if (snap.ranges.length === 0) return "None";
  if (isCollapsed(snap)) return "Caret";
  return "Range";
}

// W3C Selection API 어휘. toggleRange 만 비표준 확장.
export type SelectionAction =
  | { type: "collapse"; pointer: Pointer }
  | { type: "setBaseAndExtent"; anchor: Pointer; focus: Pointer }
  | { type: "extend"; pointer: Pointer }
  | { type: "addRange"; pointer: Pointer }
  | { type: "removeRange"; pointer: Pointer }
  | { type: "toggleRange"; pointer: Pointer }
  | { type: "empty" };

export function reduceSelection(
  prev: SelectionSnap,
  action: SelectionAction,
  mode: SelectionMode,
): SelectionSnap {
  switch (action.type) {
    case "collapse": {
      // single caret — anchor === focus, ranges = [p]
      return { ranges: [action.pointer], anchor: action.pointer, focus: action.pointer };
    }
    case "setBaseAndExtent": {
      if (mode !== "extended" && mode !== "multiple") {
        return { ranges: [action.focus], anchor: action.focus, focus: action.focus };
      }
      const expanded = expandRange(action.anchor, action.focus);
      return { ranges: expanded, anchor: action.anchor, focus: action.focus };
    }
    case "extend": {
      // anchor 유지 (없으면 pointer 가 anchor 됨), focus 갱신, range 재계산
      const anchor = prev.anchor ?? action.pointer;
      if (mode !== "extended" && mode !== "multiple") {
        return { ranges: [action.pointer], anchor: action.pointer, focus: action.pointer };
      }
      const expanded = expandRange(anchor, action.pointer);
      return { ranges: expanded, anchor, focus: action.pointer };
    }
    case "addRange": {
      if (prev.ranges.includes(action.pointer)) return { ...prev, focus: action.pointer };
      const merged = mode === "single" ? [action.pointer] : [...prev.ranges, action.pointer];
      return { ranges: merged, anchor: prev.anchor ?? action.pointer, focus: action.pointer };
    }
    case "removeRange": {
      if (!prev.ranges.includes(action.pointer)) return prev;
      const next = prev.ranges.filter((p) => p !== action.pointer);
      return {
        ranges: next,
        anchor: prev.anchor === action.pointer ? null : prev.anchor,
        focus: prev.focus === action.pointer ? next[next.length - 1] ?? null : prev.focus,
      };
    }
    case "toggleRange": {
      if (prev.ranges.includes(action.pointer)) {
        const next = prev.ranges.filter((p) => p !== action.pointer);
        return {
          ranges: next,
          anchor: prev.anchor === action.pointer ? null : prev.anchor,
          focus: prev.focus === action.pointer ? next[next.length - 1] ?? null : prev.focus,
        };
      }
      const merged = mode === "single" ? [action.pointer] : [...prev.ranges, action.pointer];
      return { ranges: merged, anchor: prev.anchor ?? action.pointer, focus: action.pointer };
    }
    case "empty":
      return EMPTY_SELECTION;
  }
}

export function applySelectionAutoRules(
  prev: SelectionSnap,
  applied: ReadonlyArray<JsonPatchOperation>,
  after: unknown,
  mode: SelectionMode,
): SelectionSnap {
  const autoTarget = pickAutoTarget(applied, after);
  if (autoTarget !== null) {
    return { ranges: limitMode(mode, [autoTarget]), anchor: autoTarget, focus: autoTarget };
  }
  const trackOrRecover = (p: Pointer | null): Pointer | null => {
    if (p === null) return null;
    const t = trackPointer(p, applied);
    if (t !== null && exists(after, t)) return t;
    return recoverLostPointer(p, applied, after);
  };
  const nextRanges: Pointer[] = [];
  for (const p of prev.ranges) {
    const next = trackOrRecover(p);
    if (next !== null && !nextRanges.includes(next)) nextRanges.push(next);
  }
  const nextAnchor = trackOrRecover(prev.anchor);
  const nextFocus = trackOrRecover(prev.focus);
  if (
    sameArray(nextRanges, prev.ranges) &&
    nextAnchor === prev.anchor &&
    nextFocus === prev.focus
  ) return prev;
  return { ranges: nextRanges, anchor: nextAnchor, focus: nextFocus };
}

export function limitMode(mode: SelectionMode, pointers: ReadonlyArray<Pointer>): Pointer[] {
  if (mode === "single") return pointers.length > 0 ? [pointers[pointers.length - 1]!] : [];
  return [...pointers];
}

function sameArray(a: ReadonlyArray<Pointer>, b: ReadonlyArray<Pointer>): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
