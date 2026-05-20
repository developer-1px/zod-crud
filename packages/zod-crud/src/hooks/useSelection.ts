// SPEC §5.7 — Selection state hook.
// React facade over the headless createSelection state.

import { useEffect, useMemo, useReducer } from "react";

import {
  createSelection,
  type CreateSelectionOptions,
  type HeadlessSelectionState,
  type SelectionState,
  type UseSelectionOptions,
  type JSONPoint,
  type SelectionMode,
  type SelectionRange,
  type SelectionRangeInput,
  type SelectionSource,
  type SelectionType,
} from "../selection.js";
import type { JSONOps } from "../jsonOps.js";

export type {
  JSONPoint,
  CreateSelectionOptions,
  HeadlessSelectionState,
  SelectionMode,
  SelectionRange,
  SelectionRangeInput,
  SelectionSource,
  SelectionState,
  SelectionType,
  UseSelectionOptions,
};

export function useSelection<T>(
  ops: JSONOps<T>,
  options: UseSelectionOptions = {},
): SelectionState<T> {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const mode = options.mode ?? "single";
  const selection = useMemo(
    () => createSelection(ops, {
      mode,
      onChange: force,
      ...(options.initial !== undefined ? { initial: options.initial } : {}),
    }),
    [ops, mode],
  );

  useEffect(() => () => selection.dispose(), [selection]);

  return selection;
}
