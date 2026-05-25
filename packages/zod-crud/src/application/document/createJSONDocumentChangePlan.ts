import { EMPTY_SELECTION, type SelectionSnap } from "../../domain/selection/selectionTypes.js";
import type { JSONPatchOperation, JSONResult } from "../../foundation/json-patch/types.js";
import type { HistoryTransactionOptions, JSONChangeMetadata } from "./stateOps.js";
import { buildChangeMetadata } from "./createJSONDocumentMetadataPlan.js";

interface DocumentChangeMetadataCaptureInput {
  shouldRecordHistory: boolean;
  activeHistoryMetadata: HistoryTransactionOptions | undefined;
  metadata: JSONChangeMetadata | undefined;
  selectionEnabled: boolean;
  documentSubscriberCount: number;
}

interface PlanDocumentChangeCaptureInput {
  historyLimit: number;
  isRestoring: boolean;
  operationCount: number;
  activeHistoryMetadata: HistoryTransactionOptions | undefined;
  metadata: JSONChangeMetadata | undefined;
  selectionEnabled: boolean;
  documentSubscriberCount: number;
}

interface DocumentChangeCapturePlan {
  shouldRecordHistory: boolean;
  shouldCaptureMetadata: boolean;
}

interface DocumentChangeHistoryRecord {
  before: unknown;
  after: unknown;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionBefore: SelectionSnap;
  selectionAfter: SelectionSnap;
  metadata?: JSONChangeMetadata;
  operationsOwned: boolean;
}

interface PlanDocumentChangeHistoryRecordInput {
  shouldRecordHistory: boolean;
  before: unknown;
  after: unknown;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionBefore: SelectionSnap;
  selectionAfter: SelectionSnap;
  metadata: JSONChangeMetadata | undefined;
  operationsOwned?: boolean;
}

interface PlanDocumentChangeApplyResultInput {
  result: JSONResult;
  lastPatchOperationCount: number;
  applied: ReadonlyArray<JSONPatchOperation>;
  history: DocumentChangeHistoryRecord | null;
}

export interface DocumentChangeApplyResultPlan {
  lastPatch: ReadonlyArray<JSONPatchOperation> | null;
  history: DocumentChangeHistoryRecord | null;
}

interface PlanDocumentChangeMetadataInput {
  shouldCaptureMetadata: boolean;
  activeHistoryMetadata: HistoryTransactionOptions | undefined;
  metadata: JSONChangeMetadata | undefined;
  selectionBefore: SelectionSnap;
  selectionEnabled: boolean;
}

interface PlanDocumentChangeSelectionInput {
  shouldCaptureMetadata: boolean;
  snapshot: () => SelectionSnap;
}

interface PlanDocumentLifecycleChangeInput {
  result: JSONResult;
  preserveHistory: boolean;
}

interface DocumentLifecycleChangePlan {
  syncLastPatch: boolean;
  clearHistory: boolean;
}

interface PlanDocumentLastPatchInput {
  operationCount: number;
  applied: ReadonlyArray<JSONPatchOperation>;
}

type DocumentSubscriptionEvent = "subscribe" | "unsubscribe";

interface PlanDocumentSubscriptionChangeInput {
  event: DocumentSubscriptionEvent;
  subscriberCount: number;
  subscribed: boolean;
}

interface DocumentSubscriptionChangePlan {
  subscriberCount: number;
  subscribed: boolean;
  shouldCallUnderlyingUnsubscribe: boolean;
}

interface PlanDocumentSubscriptionMetadataInput {
  metadata: JSONChangeMetadata | undefined;
  selectionAfter: SelectionSnap;
}

function shouldCaptureDocumentChangeMetadata(
  input: DocumentChangeMetadataCaptureInput,
): boolean {
  return input.shouldRecordHistory
    || input.activeHistoryMetadata !== undefined
    || input.metadata !== undefined
    || (input.selectionEnabled && input.documentSubscriberCount > 0);
}

export function planDocumentChangeCapture(
  input: PlanDocumentChangeCaptureInput,
): DocumentChangeCapturePlan {
  const shouldRecordHistory = input.historyLimit > 0
    && !input.isRestoring
    && input.operationCount > 0;
  return {
    shouldRecordHistory,
    shouldCaptureMetadata: shouldCaptureDocumentChangeMetadata({
      shouldRecordHistory,
      activeHistoryMetadata: input.activeHistoryMetadata,
      metadata: input.metadata,
      selectionEnabled: input.selectionEnabled,
      documentSubscriberCount: input.documentSubscriberCount,
    }),
  };
}

export function planDocumentChangeHistoryRecord(
  input: PlanDocumentChangeHistoryRecordInput,
): DocumentChangeHistoryRecord | null {
  if (!input.shouldRecordHistory) return null;

  const record: DocumentChangeHistoryRecord = {
    before: input.before,
    after: input.after,
    operations: input.operations,
    selectionBefore: input.selectionBefore,
    selectionAfter: input.selectionAfter,
    operationsOwned: input.operationsOwned === true,
  };
  if (input.metadata !== undefined) record.metadata = input.metadata;
  return record;
}

export function planDocumentChangeApplyResult(
  input: PlanDocumentChangeApplyResultInput,
): DocumentChangeApplyResultPlan {
  if (!input.result.ok) {
    return {
      lastPatch: null,
      history: null,
    };
  }
  return {
    lastPatch: planDocumentLastPatch({
      operationCount: input.lastPatchOperationCount,
      applied: input.applied,
    }),
    history: input.history,
  };
}

export function planDocumentChangeMetadata(
  input: PlanDocumentChangeMetadataInput,
): JSONChangeMetadata | undefined {
  if (!input.shouldCaptureMetadata) return undefined;
  return buildChangeMetadata(
    input.activeHistoryMetadata,
    input.metadata,
    input.selectionBefore,
    input.selectionEnabled,
  );
}

export function planDocumentChangeSelection(
  input: PlanDocumentChangeSelectionInput,
): SelectionSnap {
  return input.shouldCaptureMetadata ? input.snapshot() : EMPTY_SELECTION;
}

export function planDocumentLifecycleChange(
  input: PlanDocumentLifecycleChangeInput,
): DocumentLifecycleChangePlan {
  if (!input.result.ok) {
    return { syncLastPatch: false, clearHistory: false };
  }
  return {
    syncLastPatch: true,
    clearHistory: !input.preserveHistory,
  };
}

function planDocumentLastPatch(
  input: PlanDocumentLastPatchInput,
): ReadonlyArray<JSONPatchOperation> {
  return input.operationCount === 0 ? [] : input.applied;
}

export function planDocumentSubscriptionChange(
  input: PlanDocumentSubscriptionChangeInput,
): DocumentSubscriptionChangePlan {
  if (input.event === "subscribe") {
    if (input.subscribed) {
      return {
        subscriberCount: input.subscriberCount,
        subscribed: true,
        shouldCallUnderlyingUnsubscribe: false,
      };
    }
    return {
      subscriberCount: input.subscriberCount + 1,
      subscribed: true,
      shouldCallUnderlyingUnsubscribe: false,
    };
  }

  if (!input.subscribed) {
    return {
      subscriberCount: input.subscriberCount,
      subscribed: false,
      shouldCallUnderlyingUnsubscribe: false,
    };
  }
  return {
    subscriberCount: Math.max(0, input.subscriberCount - 1),
    subscribed: false,
    shouldCallUnderlyingUnsubscribe: true,
  };
}

export function planDocumentSubscriptionMetadata(
  input: PlanDocumentSubscriptionMetadataInput,
): JSONChangeMetadata {
  return {
    ...input.metadata,
    selectionAfter: input.metadata?.selectionAfter ?? input.selectionAfter,
  };
}
