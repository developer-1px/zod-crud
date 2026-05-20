// History entry + selection snapshot types and recordHistory helper
// for useJSONDocument. Internal — not part of the public surface.

import type { MutableRefObject } from "react";

import { computeInverses, type JSONPatchOperation } from "../core/patch/index.js";
import { commit as historyCommit, type HistoryStack } from "../core/history.js";
import type { SelectionSnap } from "../core/selection/index.js";
import type { HistoryTransactionOptions } from "../jsonOps.js";
import type { SelectionState } from "./useSelection.js";

export interface HistoryEntry {
  forward: JSONPatchOperation[];
  inverse: JSONPatchOperation[];
  selectionBefore: SelectionSnap;
  selectionAfter: SelectionSnap;
  metadata?: HistoryTransactionOptions;
}

export function snapSelection<T>(selection: SelectionState<T>): SelectionSnap {
  return {
    ranges: [...selection.ranges],
    selectedPointers: [...selection.selectedPointers],
    selectionRanges: selection.selectionRanges.map((range) => ({ ...range })),
    primaryIndex: selection.primaryIndex,
    anchor: selection.anchor,
    focus: selection.focus,
  };
}

export function recordHistoryEntry<T>(
  stackRef: MutableRefObject<HistoryStack<HistoryEntry>>,
  before: T,
  ops: ReadonlyArray<JSONPatchOperation>,
  selectionBefore: SelectionSnap,
  selectionAfter: SelectionSnap,
  limit: number,
  metadata?: HistoryTransactionOptions,
): HistoryEntry | null {
  const inv = computeInverses(before, ops);
  if (!inv.ok) return null;
  const entry: HistoryEntry = {
    forward: [...ops],
    inverse: inv.inverses,
    selectionBefore,
    selectionAfter,
  };
  if (metadata) entry.metadata = { ...metadata };
  stackRef.current = historyCommit(stackRef.current, entry, limit);
  return entry;
}
