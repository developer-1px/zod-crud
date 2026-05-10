// SPEC §5.7 — Selection state (Axis 2). 정체성: "다음 명령의 작용 범위".
// 순수 함수. React 무관.
//
// 자동 규칙 4 개:
//   ① Mutation auto-select  — add/copy/move 발생 시 destination 으로 set([dest])
//   ② Lost recovery         — 사라진 항목은 nextSibling/prev/parent 로 복구
//   ③ Index shift tracking  — 살아남은 형제 인덱스 자동 보정
//   ④ Anchor tracking       — anchor 도 동일 규칙

import { trackPointer, pickAutoTarget, recoverLostPointer, exists } from "../track.js";
import type { Pointer } from "../pointer/index.js";
import type { JsonPatchOperation } from "../patch/index.js";
import { expandRange } from "./range.js";

export type SelectionMode = "single" | "multiple" | "extended";

export interface SelectionSnap {
  values: ReadonlyArray<Pointer>;
  anchor: Pointer | null;
  focus: Pointer | null;
}

export const EMPTY_SELECTION: SelectionSnap = { values: [], anchor: null, focus: null };

export type SelectionAction =
  | { type: "set"; pointers: ReadonlyArray<Pointer> }
  | { type: "add"; pointer: Pointer }
  | { type: "remove"; pointer: Pointer }
  | { type: "toggle"; pointer: Pointer }
  | { type: "clear" }
  | { type: "range"; anchor: Pointer; focus: Pointer };

export function reduceSelection(
  prev: SelectionSnap,
  action: SelectionAction,
  mode: SelectionMode,
): SelectionSnap {
  switch (action.type) {
    case "set": {
      const limited = limitMode(mode, action.pointers);
      return {
        values: limited,
        anchor: limited.length > 0 ? limited[0]! : null,
        focus: limited.length > 0 ? limited[limited.length - 1]! : null,
      };
    }
    case "add": {
      if (prev.values.includes(action.pointer)) return { ...prev, focus: action.pointer };
      const merged = mode === "single" ? [action.pointer] : [...prev.values, action.pointer];
      return { values: merged, anchor: prev.anchor ?? action.pointer, focus: action.pointer };
    }
    case "remove": {
      if (!prev.values.includes(action.pointer)) return prev;
      const next = prev.values.filter((p) => p !== action.pointer);
      return {
        values: next,
        anchor: prev.anchor === action.pointer ? null : prev.anchor,
        focus: prev.focus === action.pointer ? next[next.length - 1] ?? null : prev.focus,
      };
    }
    case "toggle": {
      if (prev.values.includes(action.pointer)) {
        const next = prev.values.filter((p) => p !== action.pointer);
        return {
          values: next,
          anchor: prev.anchor === action.pointer ? null : prev.anchor,
          focus: prev.focus === action.pointer ? next[next.length - 1] ?? null : prev.focus,
        };
      }
      const merged = mode === "single" ? [action.pointer] : [...prev.values, action.pointer];
      return { values: merged, anchor: prev.anchor ?? action.pointer, focus: action.pointer };
    }
    case "clear":
      return EMPTY_SELECTION;
    case "range": {
      if (mode !== "extended" && mode !== "multiple") {
        return { values: [action.focus], anchor: action.focus, focus: action.focus };
      }
      const expanded = expandRange(action.anchor, action.focus);
      return { values: expanded, anchor: action.anchor, focus: action.focus };
    }
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
    return { values: limitMode(mode, [autoTarget]), anchor: autoTarget, focus: autoTarget };
  }
  const trackOrRecover = (p: Pointer | null): Pointer | null => {
    if (p === null) return null;
    const t = trackPointer(p, applied);
    if (t !== null && exists(after, t)) return t;
    return recoverLostPointer(p, applied, after);
  };
  const nextValues: Pointer[] = [];
  for (const p of prev.values) {
    const next = trackOrRecover(p);
    if (next !== null && !nextValues.includes(next)) nextValues.push(next);
  }
  const nextAnchor = trackOrRecover(prev.anchor);
  const nextFocus = trackOrRecover(prev.focus);
  if (
    sameArray(nextValues, prev.values) &&
    nextAnchor === prev.anchor &&
    nextFocus === prev.focus
  ) return prev;
  return { values: nextValues, anchor: nextAnchor, focus: nextFocus };
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
