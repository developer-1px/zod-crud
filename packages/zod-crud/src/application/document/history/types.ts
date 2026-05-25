import type { SelectionSnap } from "../../../domain/selection/types.js";
import type { JSONPatchOperation, JSONResult } from "../../../foundation/patch/types.js";
import type { HistoryTransactionOptions, JSONChangeMetadata } from "../state/types.js";

export interface DocumentHistoryEntry {
  forward: JSONPatchOperation[];
  inverse: JSONPatchOperation[];
  selectionBefore: SelectionSnap;
  selectionAfter: SelectionSnap;
  metadata?: HistoryTransactionOptions;
  snapshot?: {
    before: unknown;
    after?: unknown;
  };
}

export interface PlanDocumentHistoryEntryInput {
  before: unknown;
  after: unknown;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionBefore: SelectionSnap;
  selectionAfter: SelectionSnap;
  metadata?: JSONChangeMetadata;
  operationsOwned?: boolean;
}

export interface PlanDocumentHistoryAppendInput {
  activeTransactionStartDepth: number | undefined;
  currentDepth: number;
  previous: DocumentHistoryEntry | undefined;
  entry: DocumentHistoryEntry | null;
}

export type DocumentHistoryAppendPlan =
  | { kind: "skip" }
  | { kind: "replaceLast"; entry: DocumentHistoryEntry }
  | { kind: "commit"; entry: DocumentHistoryEntry };

export interface PlanDocumentHistoryRecordInput {
  activeTransactionStartDepth: number | undefined;
  currentDepth: number;
  previous: DocumentHistoryEntry | undefined;
  before: unknown;
  after: unknown;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionBefore: SelectionSnap;
  selectionAfter: SelectionSnap;
  metadata?: JSONChangeMetadata;
  operationsOwned?: boolean;
}

export type DocumentHistoryRestoreDirection = "undo" | "redo";
export type DocumentHistoryRestoreStack = "undo" | "redo";
export type DocumentHistoryRestoreEntryWritePhase = "beforeApply" | "afterApply";
export type DocumentHistoryRestoreMove = "back" | "forward";

export interface PlanDocumentHistoryRestoreFlowInput {
  direction: DocumentHistoryRestoreDirection;
}

export interface DocumentHistoryRestoreFlowPlan {
  entryStack: DocumentHistoryRestoreStack;
  writeEntryPhase: DocumentHistoryRestoreEntryWritePhase;
  move: DocumentHistoryRestoreMove;
}

export interface PlanDocumentHistoryRestoreInput {
  direction: DocumentHistoryRestoreDirection;
  entry: DocumentHistoryEntry;
  currentState: unknown;
  currentSelection: SelectionSnap;
}

export interface DocumentHistoryRestorePlan {
  patch: ReadonlyArray<JSONPatchOperation>;
  selectionAfter: SelectionSnap;
  entry: DocumentHistoryEntry;
  state?: unknown;
}

export interface PlanDocumentHistoryRestoreApplyInput {
  patch: ReadonlyArray<JSONPatchOperation>;
  state: unknown | undefined;
}

export type DocumentHistoryRestoreApplyPlan =
  | {
      kind: "patch";
      patch: ReadonlyArray<JSONPatchOperation>;
    }
  | {
      kind: "state";
      state: unknown;
      patch: ReadonlyArray<JSONPatchOperation>;
    };

export interface PlanDocumentHistoryRestoreCompletionInput {
  result: JSONResult;
  flow: DocumentHistoryRestoreFlowPlan;
  entry: DocumentHistoryEntry;
  selectionAfter: SelectionSnap;
}

export type DocumentHistoryRestoreCompletionPlan =
  | { ok: false }
  | {
      ok: true;
      writeEntryAfterApply: DocumentHistoryEntry | null;
      syncLastPatch: true;
      move: DocumentHistoryRestoreMove;
      selectionAfter: SelectionSnap;
    };

export interface PlanCompactedRepeatedReplaceBatchHistoryInput {
  before: unknown;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface CompactedRepeatedReplaceBatchHistoryPlan {
  forward: JSONPatchOperation[];
  inverse: JSONPatchOperation[];
}

export interface PlanRootBulkHistorySnapshotInput {
  before: unknown;
  after: unknown;
  forward: ReadonlyArray<JSONPatchOperation>;
}

export interface RootBulkHistorySnapshotPlan {
  before: unknown;
  after?: unknown;
}
