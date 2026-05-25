import type { SelectionSnap } from "../../domain/selection/index.js";
import type { JSONPatchOperation } from "../../foundation/json-patch/index.js";
import type { HistoryTransactionOptions } from "./stateOps.js";
import type { DocumentHistoryEntry } from "./createJSONDocumentHistoryTypes.js";

export interface PlanDocumentTransactionMergeInput {
  entries: ReadonlyArray<DocumentHistoryEntry>;
  start: number;
  end: number;
}

export interface PlanDocumentTransactionMergeRangeInput {
  undoStart: number;
  undoLength: number;
  depthBefore: number;
  currentDepth: number;
}

export interface DocumentTransactionMergeRange {
  start: number;
  end: number;
}

export interface PlanDocumentTransactionMergeWriteInput {
  range: DocumentTransactionMergeRange | null;
  merged: DocumentHistoryEntry | null;
}

export type DocumentTransactionMergeWritePlan =
  | { kind: "skip" }
  | {
      kind: "replaceRange";
      index: number;
      length: number;
      entry: DocumentHistoryEntry;
    };

export interface PlanDocumentTransactionAppendCompactInput {
  previous: DocumentHistoryEntry;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionAfter: SelectionSnap;
  metadata: HistoryTransactionOptions | undefined;
}

export interface PlanDocumentTransactionAppendFastPathInput {
  activeTransactionStartDepth: number | undefined;
  currentDepth: number;
  previous: DocumentHistoryEntry | undefined;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionAfter: SelectionSnap;
  metadata: HistoryTransactionOptions | undefined;
}

export type DocumentTransactionAppendFastPathPlan =
  | { kind: "skip" }
  | { kind: "replaceLast"; entry: DocumentHistoryEntry };
