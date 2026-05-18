// History entry + selection snapshot types and recordHistory helper
// for useJSONDocument. Internal — not part of the public surface.

import type { MutableRefObject } from "react";

import { computeInverses, type JSONPatchOperation } from "../core/patch/index.js";
import { commit as historyCommit, type HistoryStack } from "../core/history.js";
import type { SelectionSnap } from "../core/selection/index.js";
import type { SelectionState } from "./useSelection.js";

export interface HistoryEntry {
  forward: JSONPatchOperation[];
  inverse: JSONPatchOperation[];
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
  ops: ReadonlyArray<JSONPatchOperation>,
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
