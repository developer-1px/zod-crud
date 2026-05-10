// SPEC §5.7 — Selection state hook (Axis 2). pure 로직은 core/selection/.
// 이 파일의 역할: useState + ops.subscribe wiring + reducer dispatch.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  EMPTY_SELECTION,
  reduceSelection,
  applySelectionAutoRules,
  type SelectionSnap,
  type SelectionMode,
  type SelectionAction,
} from "../core/selection/index.js";
import type { Pointer } from "../core/pointer/index.js";
import type { JsonOps } from "./useJson.js";

export type { SelectionMode };

export interface UseSelectionOptions {
  mode?: SelectionMode;
  initial?: ReadonlyArray<Pointer>;
}

export interface SelectionState<T> {
  values: ReadonlyArray<Pointer>;
  anchor: Pointer | null;
  focus: Pointer | null;
  has(pointer: Pointer): boolean;
  set(pointers: ReadonlyArray<Pointer>): void;
  add(pointer: Pointer): void;
  remove(pointer: Pointer): void;
  toggle(pointer: Pointer): void;
  clear(): void;
  range(anchor: Pointer, focus: Pointer): void;
}

export function useSelection<T>(
  ops: JsonOps<T>,
  options: UseSelectionOptions = {},
): SelectionState<T> {
  const mode: SelectionMode = options.mode ?? "single";
  const [snap, setSnap] = useState<SelectionSnap>(() =>
    options.initial && options.initial.length > 0
      ? reduceSelection(EMPTY_SELECTION, { type: "set", pointers: options.initial }, mode)
      : EMPTY_SELECTION,
  );

  useEffect(() => {
    return ops.subscribe((applied) => {
      setSnap((prev) => applySelectionAutoRules(prev, applied, ops.state, mode));
    });
  }, [ops, mode]);

  const dispatch = useCallback(
    (action: SelectionAction) => setSnap((prev) => reduceSelection(prev, action, mode)),
    [mode],
  );

  const valuesRef = useRef(snap.values);
  valuesRef.current = snap.values;

  return useMemo<SelectionState<T>>(
    () => ({
      values: snap.values,
      anchor: snap.anchor,
      focus: snap.focus,
      has(pointer) { return valuesRef.current.includes(pointer); },
      set: (pointers) => dispatch({ type: "set", pointers }),
      add: (pointer) => dispatch({ type: "add", pointer }),
      remove: (pointer) => dispatch({ type: "remove", pointer }),
      toggle: (pointer) => dispatch({ type: "toggle", pointer }),
      clear: () => dispatch({ type: "clear" }),
      range: (anchor, focus) => dispatch({ type: "range", anchor, focus }),
    }),
    [snap, dispatch],
  );
}
