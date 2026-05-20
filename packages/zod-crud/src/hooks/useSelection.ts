// SPEC §5.7 — Selection state hook. pure 로직은 core/selection/.
// W3C Selection API 어휘. collapsed selection = 캐럿 (별도 focus 축 없음).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  EMPTY_SELECTION,
  reduceSelection,
  applySelectionAutoRules,
  caretPointer,
  caretPoint,
  isCollapsed,
  primaryPointer,
  primaryRange,
  selectionType,
  type SelectionSnap,
  type SelectionMode,
  type SelectionAction,
  type SelectionType,
  type JSONPoint,
  type SelectionRange,
} from "../core/selection/index.js";
import type { Pointer } from "../core/pointer/index.js";
import type { JSONOps } from "./useJSON.js";

export type { JSONPoint, SelectionMode, SelectionRange, SelectionType };

export interface UseSelectionOptions {
  mode?: SelectionMode;
  initial?: ReadonlyArray<JSONPoint>;
}

export interface SelectionState<T> {
  ranges: ReadonlyArray<Pointer>;
  selectedPointers: ReadonlyArray<Pointer>;
  selectionRanges: ReadonlyArray<SelectionRange>;
  primaryIndex: number;
  primaryRange: SelectionRange | null;
  primaryPointer: Pointer | null;
  caret: JSONPoint | null;
  caretPointer: Pointer | null;
  anchor: JSONPoint | null;
  focus: JSONPoint | null;
  isCollapsed: boolean;
  type: SelectionType;
  collapse(point: JSONPoint): void;
  setBaseAndExtent(anchor: JSONPoint, focus: JSONPoint): void;
  extend(point: JSONPoint): void;
  addRange(pointOrRange: JSONPoint | SelectionRange): void;
  removeRange(pointOrRangeOrIndex: JSONPoint | SelectionRange | number): void;
  toggleRange(pointOrRange: JSONPoint | SelectionRange): void;
  // 비표준 escape hatch — 도메인-aware range 확장 (DFS 등) 을 호출자가 계산해 넘긴다.
  selectRanges(
    ranges: ReadonlyArray<Pointer | SelectionRange>,
    anchor?: JSONPoint | null,
    focus?: JSONPoint | null,
    primaryIndex?: number,
  ): void;
  empty(): void;
  containsNode(pointer: Pointer): boolean;
}

export function useSelection<T>(
  ops: JSONOps<T>,
  options: UseSelectionOptions = {},
): SelectionState<T> {
  const mode: SelectionMode = options.mode ?? "single";
  const [snap, setSnap] = useState<SelectionSnap>(() => {
    const init = options.initial;
    if (!init?.length) return EMPTY_SELECTION;
    return reduceSelection(
      EMPTY_SELECTION,
      { type: "setBaseAndExtent", anchor: init[0]!, focus: init[init.length - 1]! },
      mode,
      ops.state,
    );
  });
  const snapRef = useRef(snap);
  snapRef.current = snap;

  useEffect(() => {
    return ops.subscribe((applied) => {
      const next = applySelectionAutoRules(snapRef.current, applied, ops.state, mode);
      snapRef.current = next;
      setSnap(next);
    });
  }, [ops, mode]);

  // dispatch 시 ops.state 를 전달 — reducer 의 setBaseAndExtent/extend 가 DFS 확장에 사용.
  const dispatch = useCallback(
    (action: SelectionAction) => {
      const next = reduceSelection(snapRef.current, action, mode, ops.state);
      snapRef.current = next;
      setSnap(next);
    },
    [ops, mode],
  );

  return useMemo<SelectionState<T>>(() => ({
    get ranges() { return snapRef.current.ranges; },
    get selectedPointers() { return snapRef.current.selectedPointers; },
    get selectionRanges() { return snapRef.current.selectionRanges; },
    get primaryIndex() { return snapRef.current.primaryIndex; },
    get primaryRange() { return primaryRange(snapRef.current); },
    get primaryPointer() { return primaryPointer(snapRef.current); },
    get caret() { return caretPoint(snapRef.current); },
    get caretPointer() { return caretPointer(snapRef.current); },
    get anchor() { return snapRef.current.anchor; },
    get focus() { return snapRef.current.focus; },
    get isCollapsed() { return isCollapsed(snapRef.current); },
    get type() { return selectionType(snapRef.current); },
    collapse: (point) => dispatch({ type: "collapse", point }),
    setBaseAndExtent: (anchor, focus) => dispatch({ type: "setBaseAndExtent", anchor, focus }),
    extend: (point) => dispatch({ type: "extend", point }),
    addRange: (pointOrRange) => dispatch(isSelectionRange(pointOrRange)
      ? { type: "addRange", range: pointOrRange }
      : { type: "addRange", point: pointOrRange }),
    removeRange: (pointOrRangeOrIndex) => dispatch(typeof pointOrRangeOrIndex === "number"
      ? { type: "removeRange", index: pointOrRangeOrIndex }
      : isSelectionRange(pointOrRangeOrIndex)
        ? { type: "removeRange", range: pointOrRangeOrIndex }
        : { type: "removeRange", point: pointOrRangeOrIndex }),
    toggleRange: (pointOrRange) => dispatch(isSelectionRange(pointOrRange)
      ? { type: "toggleRange", range: pointOrRange }
      : { type: "toggleRange", point: pointOrRange }),
    selectRanges: (ranges, anchor, focus, primaryIndex) => dispatch({
      type: "selectRanges",
      ranges,
      ...(anchor !== undefined ? { anchor } : {}),
      ...(focus !== undefined ? { focus } : {}),
      ...(primaryIndex !== undefined ? { primaryIndex } : {}),
    }),
    empty: () => dispatch({ type: "empty" }),
    containsNode: (pointer) => snapRef.current.selectedPointers.includes(pointer),
  }), [dispatch]);
}

function isSelectionRange(input: JSONPoint | SelectionRange): input is SelectionRange {
  return typeof input === "object" && "anchor" in input && "focus" in input;
}
