// History entry + selection snapshot types and recordHistory helper
// for useJsonDocument. Internal — not part of the public surface.

import type { MutableRefObject } from "react";

import { computeInverses, type JsonPatchOperation } from "../core/patch/index.js";
import type { Pointer } from "../core/pointer/index.js";
import { commit as historyCommit, type HistoryStack } from "../core/history/stack.js";
import type { SelectionState } from "./useSelection.js";

export interface SelectionSnap {
  ranges: ReadonlyArray<Pointer>;
  anchor: Pointer | null;
  focus: Pointer | null;
}

export interface HistoryEntry {
  forward: JsonPatchOperation[];
  inverse: JsonPatchOperation[];
  selectionBefore: SelectionSnap;
  selectionAfter: SelectionSnap;
}

export function snapSelection<T>(selection: SelectionState<T>): SelectionSnap {
  return {
    ranges: [...selection.ranges],
    anchor: selection.anchor,
    focus: selection.focus,
  };
}

export function recordHistoryEntry<T>(
  stackRef: MutableRefObject<HistoryStack<HistoryEntry>>,
  before: T,
  ops: ReadonlyArray<JsonPatchOperation>,
  selection: SelectionState<T>,
  limit: number,
): void {
  const inv = computeInverses(before, ops);
  if (!inv.ok) return;
  const snap = snapSelection(selection);
  const entry: HistoryEntry = {
    forward: [...ops],
    inverse: inv.inverses,
    selectionBefore: snap,
    selectionAfter: snap,
  };
  stackRef.current = historyCommit(stackRef.current, entry, limit);
}
