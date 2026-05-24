import type { JSONPatchOperation, JSONResult } from "../../foundation/json-patch/index.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import type { SelectionSnap } from "../../domain/selection/index.js";
import type { HistoryTransactionOptions, JSONChangeMetadata } from "./stateOps.js";

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

type HistoryEntry = DocumentHistoryEntry;

export interface DocumentChangeMetadataCaptureInput {
  shouldRecordHistory: boolean;
  activeHistoryMetadata: HistoryTransactionOptions | undefined;
  metadata: JSONChangeMetadata | undefined;
  selectionEnabled: boolean;
  documentSubscriberCount: number;
}

export interface PlanDocumentChangeCaptureInput {
  historyLimit: number;
  isRestoring: boolean;
  operationCount: number;
  activeHistoryMetadata: HistoryTransactionOptions | undefined;
  metadata: JSONChangeMetadata | undefined;
  selectionEnabled: boolean;
  documentSubscriberCount: number;
}

export interface DocumentChangeCapturePlan {
  shouldRecordHistory: boolean;
  shouldCaptureMetadata: boolean;
}

export interface DocumentChangeHistoryRecord {
  before: unknown;
  after: unknown;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionBefore: SelectionSnap;
  selectionAfter: SelectionSnap;
  metadata?: JSONChangeMetadata;
  operationsOwned: boolean;
}

export interface PlanDocumentChangeHistoryRecordInput {
  shouldRecordHistory: boolean;
  before: unknown;
  after: unknown;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionBefore: SelectionSnap;
  selectionAfter: SelectionSnap;
  metadata: JSONChangeMetadata | undefined;
  operationsOwned?: boolean;
}

export interface PlanDocumentChangeApplyResultInput {
  result: JSONResult;
  lastPatchOperationCount: number;
  applied: ReadonlyArray<JSONPatchOperation>;
  history: DocumentChangeHistoryRecord | null;
}

export interface DocumentChangeApplyResultPlan {
  lastPatch: ReadonlyArray<JSONPatchOperation> | null;
  history: DocumentChangeHistoryRecord | null;
}

export interface PlanDocumentChangeMetadataInput {
  shouldCaptureMetadata: boolean;
  activeHistoryMetadata: HistoryTransactionOptions | undefined;
  metadata: JSONChangeMetadata | undefined;
  selectionBefore: SelectionSnap;
  selectionEnabled: boolean;
}

export interface PlanDocumentChangeSelectionInput {
  shouldCaptureMetadata: boolean;
  snapshot: () => SelectionSnap;
}

export interface PlanDocumentLifecycleChangeInput {
  result: JSONResult;
  preserveHistory: boolean;
}

export interface DocumentLifecycleChangePlan {
  syncLastPatch: boolean;
  clearHistory: boolean;
}

export interface PlanDocumentLastPatchInput {
  operationCount: number;
  applied: ReadonlyArray<JSONPatchOperation>;
}

export type DocumentSubscriptionEvent = "subscribe" | "unsubscribe";

export interface PlanDocumentSubscriptionChangeInput {
  event: DocumentSubscriptionEvent;
  subscriberCount: number;
  subscribed: boolean;
}

export interface DocumentSubscriptionChangePlan {
  subscriberCount: number;
  subscribed: boolean;
  shouldCallUnderlyingUnsubscribe: boolean;
}

export interface PlanDocumentSubscriptionMetadataInput {
  metadata: JSONChangeMetadata | undefined;
  selectionAfter: SelectionSnap;
}

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

export interface PlanDocumentHistoryMergeMetadataInput {
  previous: HistoryTransactionOptions | undefined;
  next: HistoryTransactionOptions | undefined;
  options?: { mergeKey?: string };
}

export interface PlanDocumentHistoryMergeLastInput {
  isRestoring: boolean;
  historyDepth: number;
  previous: DocumentHistoryEntry | undefined;
  top: DocumentHistoryEntry | undefined;
  options?: { mergeKey?: string };
}

export interface PlanDocumentHistoryMergeLastWriteInput {
  undoLength: number;
  merged: DocumentHistoryEntry | null;
}

export type DocumentHistoryMergeLastWritePlan =
  | { kind: "skip" }
  | {
      kind: "replaceLastPair";
      index: number;
      length: number;
      entry: DocumentHistoryEntry;
    };

export interface PlanDocumentActiveHistoryMetadataInput {
  active: HistoryTransactionOptions | undefined;
  next: HistoryTransactionOptions | undefined;
}

export interface PlanDocumentTransactionScopeInput {
  activeTransactionStartDepth: number | undefined;
  depthBefore: number;
}

export interface DocumentTransactionScopePlan {
  activeTransactionStartDepth: number;
  restoreTransactionStartDepth: number | undefined;
}

export interface PlanDocumentTransactionCallInput {
  optionsOrFn: HistoryTransactionOptions | (() => void);
  maybeFn: (() => void) | undefined;
}

export type DocumentTransactionCallPlan =
  | { kind: "skip" }
  | {
      kind: "run";
      metadata: HistoryTransactionOptions | undefined;
      fn: () => void;
    };

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
