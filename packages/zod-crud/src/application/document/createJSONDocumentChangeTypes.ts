import type { SelectionSnap } from "../../domain/selection/index.js";
import type { JSONPatchOperation, JSONResult } from "../../foundation/json-patch/index.js";
import type { HistoryTransactionOptions, JSONChangeMetadata } from "./stateOps.js";

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
