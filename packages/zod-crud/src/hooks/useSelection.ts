// SPEC §5.7 — Selection state hook (Axis 2). pure 로직은 core/selection/.
// W3C Selection API 어휘: collapse / setBaseAndExtent / extend / addRange /
// removeRange / empty / containsNode / toggleRange (비표준 확장).
//
// DOM Selection 모델: collapsed selection 이 곧 캐럿. 별도 focus 축 없음.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import type { JsonOps } from "./useJson.js";

export type { SelectionMode, SelectionType };

export interface UseSelectionOptions {
  mode?: SelectionMode;
  initial?: ReadonlyArray<Pointer>;
}

export interface SelectionState<T> {
  // W3C Selection API 어휘
  ranges: ReadonlyArray<Pointer>;
  anchor: Pointer | null;
  focus: Pointer | null;
  isCollapsed: boolean;
  type: SelectionType;
  // methods
  collapse(pointer: Pointer): void;
  setBaseAndExtent(anchor: Pointer, focus: Pointer): void;
  extend(pointer: Pointer): void;
  addRange(pointer: Pointer): void;
  removeRange(pointer: Pointer): void;
  toggleRange(pointer: Pointer): void;
  empty(): void;
  containsNode(pointer: Pointer): boolean;
}

export function useSelection<T>(
  ops: JsonOps<T>,
  options: UseSelectionOptions = {},
): SelectionState<T> {
  const mode: SelectionMode = options.mode ?? "single";
  const [snap, setSnap] = useState<SelectionSnap>(() => {
    if (!options.initial || options.initial.length === 0) return EMPTY_SELECTION;
    if (options.initial.length === 1) {
      return reduceSelection(EMPTY_SELECTION, { type: "collapse", pointer: options.initial[0]! }, mode);
    }
    return reduceSelection(
      EMPTY_SELECTION,
      { type: "setBaseAndExtent", anchor: options.initial[0]!, focus: options.initial[options.initial.length - 1]! },
      mode,
    );
  });

  useEffect(() => {
    return ops.subscribe((applied) => {
      setSnap((prev) => applySelectionAutoRules(prev, applied, ops.state, mode));
    });
  }, [ops, mode]);

  const dispatch = useCallback(
    (action: SelectionAction) => setSnap((prev) => reduceSelection(prev, action, mode)),
    [mode],
  );

  const rangesRef = useRef(snap.ranges);
  rangesRef.current = snap.ranges;

  return useMemo<SelectionState<T>>(
    () => ({
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
      empty: () => dispatch({ type: "empty" }),
      containsNode: (pointer) => rangesRef.current.includes(pointer),
    }),
    [snap, dispatch],
  );
}
