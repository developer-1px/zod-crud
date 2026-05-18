// SPEC §5.7 — Selection state hook. pure 로직은 core/selection/.
// W3C Selection API 어휘. collapsed selection = 캐럿 (별도 focus 축 없음).

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  EMPTY_SELECTION,
  reduceSelection,
  applySelectionAutoRules,
  isCollapsed,
  selectionType,
  type SelectionSnap,
  type SelectionMode,
  type SelectionAction,
  type SelectionType,
} from "../core/selection/index.js";
import type { Pointer } from "../core/pointer/index.js";
import type { JSONOps } from "./useJSON.js";

export type { SelectionMode, SelectionType };

export interface UseSelectionOptions {
  mode?: SelectionMode;
  initial?: ReadonlyArray<Pointer>;
}

export interface SelectionState<T> {
  ranges: ReadonlyArray<Pointer>;
  anchor: Pointer | null;
  focus: Pointer | null;
  isCollapsed: boolean;
  type: SelectionType;
  collapse(pointer: Pointer): void;
  setBaseAndExtent(anchor: Pointer, focus: Pointer): void;
  extend(pointer: Pointer): void;
  addRange(pointer: Pointer): void;
  removeRange(pointer: Pointer): void;
  toggleRange(pointer: Pointer): void;
  // 비표준 escape hatch — 도메인-aware range 확장 (DFS 등) 을 호출자가 계산해 넘긴다.
  selectRanges(ranges: ReadonlyArray<Pointer>, anchor: Pointer | null, focus: Pointer | null): void;
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

  useEffect(() => {
    return ops.subscribe((applied) => {
      setSnap((prev) => applySelectionAutoRules(prev, applied, ops.state, mode));
    });
  }, [ops, mode]);

  // dispatch 시 ops.state 를 전달 — reducer 의 setBaseAndExtent/extend 가 DFS 확장에 사용.
  const dispatch = useCallback(
    (action: SelectionAction) => setSnap((prev) => reduceSelection(prev, action, mode, ops.state)),
    [ops, mode],
  );

  return useMemo<SelectionState<T>>(() => ({
    ranges: snap.ranges,
    anchor: snap.anchor,
    focus: snap.focus,
    isCollapsed: isCollapsed(snap),
    type: selectionType(snap),
    collapse: (pointer) => dispatch({ type: "collapse", pointer }),
    setBaseAndExtent: (anchor, focus) => dispatch({ type: "setBaseAndExtent", anchor, focus }),
    extend: (pointer) => dispatch({ type: "extend", pointer }),
    addRange: (pointer) => dispatch({ type: "addRange", pointer }),
    removeRange: (pointer) => dispatch({ type: "removeRange", pointer }),
    toggleRange: (pointer) => dispatch({ type: "toggleRange", pointer }),
    selectRanges: (ranges, anchor, focus) => dispatch({ type: "selectRanges", ranges, anchor, focus }),
    empty: () => dispatch({ type: "empty" }),
    containsNode: (pointer) => snap.ranges.includes(pointer),
  }), [snap, dispatch]);
}
