import type * as z from "zod";
import type { JSONPatchOperation, JSONResult } from "../../foundation/json-patch/index.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import { commitMutable, historyDepth } from "../../foundation/history.js";
import { duplicate as duplicateVerb } from "../../domain/verbs/duplicate.js";
import type { JSONDocumentCommitOptions, JSONDocumentDuplicateOptions, JSONDocumentDuplicateResult, JSONPatchInput } from "./createJSONDocumentPublicTypes.js";
import type { DocumentChangeApplyResultPlan } from "./createJSONDocumentChangeTypes.js";
import {
  planDocumentCommitPreview,
  planDocumentCommitRoute,
  planDocumentCommitSelection,
  planDocumentDuplicateApplyResult,
  planDocumentPatchCall,
} from "./createJSONDocumentInteractionPlan.js";
import {
  planDocumentChangeApplyResult,
  planDocumentChangeCapture,
  planDocumentChangeHistoryRecord,
  planDocumentChangeMetadata,
  planDocumentChangeSelection,
} from "./createJSONDocumentChangePlan.js";
import { shouldRecordDocumentCommitHistory } from "./createJSONDocumentInteractionPlan.js";
import { planDocumentHistoryRecord } from "./createJSONDocumentHistoryPlan.js";
import type {
  DocumentHistoryRuntimeState,
  DocumentPatchRuntimeState,
  SelectionRuntimeAccess,
  TrustedDocumentStateOps,
} from "./createJSONDocumentRuntimeTypes.js";
import type { HistoryTransactionOptions, JSONChangeMetadata } from "./stateOps.js";

export interface CreateDocumentMutationRuntimeInput<S extends z.ZodType> {
  schema: S;
  rawOps: TrustedDocumentStateOps<z.output<S>>;
  historyLimit: number;
  historyState: DocumentHistoryRuntimeState;
  patchState: DocumentPatchRuntimeState;
  selection: SelectionRuntimeAccess;
}

export function createDocumentMutationRuntime<S extends z.ZodType>(
  input: CreateDocumentMutationRuntimeInput<S>,
) {
  const { schema, rawOps, historyLimit, historyState, patchState, selection } = input;

  const recordHistory = (
    before: z.output<S>,
    after: z.output<S>,
    operations: ReadonlyArray<JSONPatchOperation>,
    selectionBefore: import("../../domain/selection/index.js").SelectionSnap,
    selectionAfter: import("../../domain/selection/index.js").SelectionSnap,
    metadata?: HistoryTransactionOptions,
    operationsOwned = false,
  ): void => {
    const currentDepth = historyDepth(historyState.stack);
    const recordPlan = planDocumentHistoryRecord({
      activeTransactionStartDepth: historyState.activeTransactionStartDepth,
      currentDepth,
      previous: historyState.stack.undo[historyState.stack.undo.length - 1],
      before,
      after,
      operations,
      selectionBefore,
      selectionAfter,
      ...(metadata !== undefined ? { metadata } : {}),
      ...(operationsOwned ? { operationsOwned } : {}),
    });
    if (recordPlan.kind === "skip") return;
    if (recordPlan.kind === "replaceLast") {
      historyState.stack.undo[historyState.stack.undo.length - 1] = recordPlan.entry;
      return;
    }
    commitMutable(historyState.stack, recordPlan.entry, historyLimit);
  };

  const applyDocumentChangePlan = (plan: DocumentChangeApplyResultPlan): void => {
    if (plan.lastPatch !== null) patchState.lastPatch = plan.lastPatch;
    const history = plan.history;
    if (history === null) return;
    recordHistory(
      history.before as z.output<S>,
      history.after as z.output<S>,
      history.operations,
      history.selectionBefore,
      history.selectionAfter,
      history.metadata,
      history.operationsOwned,
    );
  };

  const applyDocumentPatch = (
    operations: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
    operationsOwned = false,
  ): JSONResult => {
    const capture = planDocumentChangeCapture({
      historyLimit,
      isRestoring: historyState.isRestoring,
      operationCount: operations.length,
      activeHistoryMetadata: historyState.activeHistoryMetadata,
      metadata,
      selectionEnabled: selection.selectionEnabled,
      documentSubscriberCount: patchState.documentSubscriberCount,
    });
    if (!capture.shouldCaptureMetadata) {
      const r = rawOps.patch(operations);
      applyDocumentChangePlan(planDocumentChangeApplyResult({
        result: r,
        lastPatchOperationCount: operations.length,
        applied: rawOps.lastApplied,
        history: null,
      }));
      return r;
    }

    const before = capture.shouldRecordHistory ? rawOps.state : undefined;
    const selectionBefore = selection.snapSelection();
    const changeMetadata = planDocumentChangeMetadata({
      shouldCaptureMetadata: capture.shouldCaptureMetadata,
      activeHistoryMetadata: historyState.activeHistoryMetadata,
      metadata,
      selectionBefore,
      selectionEnabled: selection.selectionEnabled,
    });
    const r = rawOps.patch(operations, changeMetadata);
    const selectionAfter = selection.snapSelection();
    applyDocumentChangePlan(planDocumentChangeApplyResult({
      result: r,
      lastPatchOperationCount: operations.length,
      applied: rawOps.lastApplied,
      history: planDocumentChangeHistoryRecord({
        shouldRecordHistory: capture.shouldRecordHistory,
        before,
        after: rawOps.state,
        operations,
        selectionBefore,
        selectionAfter,
        metadata: changeMetadata,
        operationsOwned,
      }),
    }));
    return r;
  };

  const applyPreviewedDocumentPatch = (
    next: z.output<S>,
    operations: ReadonlyArray<JSONPatchOperation>,
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ): JSONResult => {
    const capture = planDocumentChangeCapture({
      historyLimit,
      isRestoring: historyState.isRestoring,
      operationCount: operations.length,
      activeHistoryMetadata: historyState.activeHistoryMetadata,
      metadata,
      selectionEnabled: selection.selectionEnabled,
      documentSubscriberCount: patchState.documentSubscriberCount,
    });
    if (!capture.shouldCaptureMetadata) {
      const r = rawOps.trustedApply(next, applied);
      applyDocumentChangePlan(planDocumentChangeApplyResult({
        result: r,
        lastPatchOperationCount: applied.length,
        applied: rawOps.lastApplied,
        history: null,
      }));
      return r;
    }

    const before = capture.shouldRecordHistory ? rawOps.state : undefined;
    const selectionBefore = selection.snapSelection();
    const changeMetadata = planDocumentChangeMetadata({
      shouldCaptureMetadata: capture.shouldCaptureMetadata,
      activeHistoryMetadata: historyState.activeHistoryMetadata,
      metadata,
      selectionBefore,
      selectionEnabled: selection.selectionEnabled,
    });
    const r = rawOps.trustedApply(next, applied, changeMetadata);
    const selectionAfter = selection.snapSelection();
    applyDocumentChangePlan(planDocumentChangeApplyResult({
      result: r,
      lastPatchOperationCount: applied.length,
      applied: rawOps.lastApplied,
      history: planDocumentChangeHistoryRecord({
        shouldRecordHistory: capture.shouldRecordHistory,
        before,
        after: next,
        operations,
        selectionBefore,
        selectionAfter,
        metadata: changeMetadata,
      }),
    }));
    return r;
  };

  const patch = (operations: JSONPatchInput, metadata?: JSONChangeMetadata): JSONResult => {
    const plan = planDocumentPatchCall({ operations });
    return applyDocumentPatch(plan.operations, metadata, plan.operationsOwned);
  };

  const commit = (
    operations: ReadonlyArray<JSONPatchOperation>,
    commitOptions?: JSONDocumentCommitOptions,
  ): JSONResult => {
    const route = planDocumentCommitRoute({ options: commitOptions });
    if (route.kind === "patch") return applyDocumentPatch(operations, route.metadata);
    const before = rawOps.state;
    const selectionBefore = selection.snapSelection();
    const predicted = rawOps.previewPatch(operations);
    const preview = planDocumentCommitPreview(predicted);
    if (preview.kind === "fallbackPatch") return patch(operations, route.metadata);
    const plan = planDocumentCommitSelection({
      activeHistoryMetadata: historyState.activeHistoryMetadata,
      metadata: route.metadata,
      selection: route.selection,
      selectionBefore,
      state: preview.state,
      selectionMode: selection.selectionMode,
      selectionEnabled: selection.selectionEnabled,
    });
    const r = rawOps.trustedApply(preview.state as z.output<S>, preview.applied, plan.changeMetadata);
    if (!r.ok) return r;
    selection.restoreSelection(plan.selectionAfter);
    applyDocumentChangePlan(planDocumentChangeApplyResult({
      result: r,
      lastPatchOperationCount: operations.length,
      applied: rawOps.lastApplied,
      history: planDocumentChangeHistoryRecord({
        shouldRecordHistory: shouldRecordDocumentCommitHistory({
          historyLimit,
          isRestoring: historyState.isRestoring,
          operationCount: operations.length,
        }),
        before,
        after: predicted.state,
        operations,
        selectionBefore,
        selectionAfter: plan.selectionAfter,
        metadata: plan.changeMetadata,
      }),
    }));
    return r;
  };

  const duplicate = (
    source: Pointer,
    duplicateOptions?: JSONDocumentDuplicateOptions,
  ): JSONDocumentDuplicateResult<z.output<S>> => {
    const before = rawOps.state;
    const planned = duplicateVerb(schema, before, source, duplicateOptions, {
      previewPatch: rawOps.previewPatch,
      trustedPayload: rawOps.stateJsonTrusted,
    });
    if (!planned.ok) return planned;
    const capture = planDocumentChangeCapture({
      historyLimit,
      isRestoring: historyState.isRestoring,
      operationCount: planned.patch.length,
      activeHistoryMetadata: historyState.activeHistoryMetadata,
      metadata: undefined,
      selectionEnabled: selection.selectionEnabled,
      documentSubscriberCount: patchState.documentSubscriberCount,
    });
    const selectionBefore = planDocumentChangeSelection({ shouldCaptureMetadata: capture.shouldCaptureMetadata, snapshot: selection.snapSelection });
    const changeMetadata = planDocumentChangeMetadata({
      shouldCaptureMetadata: capture.shouldCaptureMetadata,
      activeHistoryMetadata: historyState.activeHistoryMetadata,
      metadata: undefined,
      selectionBefore,
      selectionEnabled: selection.selectionEnabled,
    });
    const r = rawOps.trustedApply(planned.next, planned.patch, changeMetadata);
    const selectionAfter = planDocumentChangeSelection({ shouldCaptureMetadata: capture.shouldCaptureMetadata, snapshot: selection.snapSelection });
    applyDocumentChangePlan(planDocumentChangeApplyResult({
      result: r,
      lastPatchOperationCount: planned.patch.length,
      applied: rawOps.lastApplied,
      history: planDocumentChangeHistoryRecord({
        shouldRecordHistory: capture.shouldRecordHistory,
        before,
        after: planned.next,
        operations: planned.patch,
        selectionBefore,
        selectionAfter,
        metadata: changeMetadata,
      }),
    }));
    return planDocumentDuplicateApplyResult({
      result: r,
      state: rawOps.state,
      applied: patchState.lastPatch,
      duplicatedTo: planned.duplicatedTo,
    });
  };

  return { applyDocumentPatch, applyPreviewedDocumentPatch, patch, commit, duplicate };
}
