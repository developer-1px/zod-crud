import type * as z from "zod";
import type { JSONPatchOperation, JSONResult } from "../../../foundation/patch/contract.js";
import type { Pointer } from "../../../foundation/pointer/index.js";
import { commitMutable, historyDepth } from "../../../foundation/history.js";
import { duplicate as duplicateVerb } from "../../../domain/edit/duplicate.js";
import { restoreSelection } from "../../../domain/selection/snap.js";
import { EMPTY_SELECTION, type SelectionSnap } from "../../../domain/selection/snap.js";
import type {
  HistoryTransactionOptions,
  JSONChangeMetadata,
  JSONDocumentCommitOptions,
} from "../history/metadata.js";
import type {
  JSONDocumentDuplicateOptions,
  JSONDocumentDuplicateResult,
} from "../edit/actions.js";
import { buildChangeMetadata, compactHistoryMetadata } from "../history/metadata.js";
import { planDocumentHistoryRecord } from "../history/restore.js";
import type {
  DocumentHistoryRuntimeState,
} from "../history/state.js";
import type { TrustedJSONStateOps } from "./json.js";
import type { DocumentPatchRuntimeState } from "./runtime.js";
import type { SelectionRuntimeAccess } from "../selection/runtime.js";

export type JSONPatchInput = JSONPatchOperation | ReadonlyArray<JSONPatchOperation>;

interface CreateDocumentMutationRuntimeInput<S extends z.ZodType> {
  schema: S;
  rawOps: TrustedJSONStateOps<z.output<S>>;
  historyLimit: number;
  historyState: DocumentHistoryRuntimeState;
  patchState: DocumentPatchRuntimeState;
  selection: SelectionRuntimeAccess;
}

interface DocumentChangeHistoryRecord {
  before: unknown;
  after: unknown;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionBefore: SelectionSnap;
  selectionAfter: SelectionSnap;
  metadata: JSONChangeMetadata | undefined;
  operationsOwned: boolean;
}

export function createDocumentMutationRuntime<S extends z.ZodType>(
  input: CreateDocumentMutationRuntimeInput<S>,
) {
  const { schema, rawOps, historyLimit, historyState, patchState, selection } = input;

  const recordHistory = (
    before: z.output<S>,
    after: z.output<S>,
    operations: ReadonlyArray<JSONPatchOperation>,
    selectionBefore: SelectionSnap,
    selectionAfter: SelectionSnap,
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
      metadata,
      operationsOwned,
    });
    if (recordPlan.kind === "skip") return;
    if (recordPlan.kind === "replaceLast") {
      historyState.stack.undo[historyState.stack.undo.length - 1] = recordPlan.entry;
      return;
    }
    commitMutable(historyState.stack, recordPlan.entry, historyLimit);
  };

  const shouldRecordHistory = (operationCount: number): boolean =>
    historyLimit > 0 && !historyState.isRestoring && operationCount > 0;
  const shouldCaptureMetadata = (
    record: boolean,
    metadata: JSONChangeMetadata | undefined,
  ): boolean =>
    record
    || historyState.activeHistoryMetadata !== undefined
    || metadata !== undefined
    || (selection.selectionEnabled && patchState.documentSubscriberCount > 0);
  const historyRecord = (
    record: boolean,
    before: unknown,
    after: unknown,
    operations: ReadonlyArray<JSONPatchOperation>,
    selectionBefore: SelectionSnap,
    selectionAfter: SelectionSnap,
    metadata: JSONChangeMetadata | undefined,
    operationsOwned = false,
  ): DocumentChangeHistoryRecord | null => {
    if (!record) return null;
    return {
      before,
      after,
      operations,
      selectionBefore,
      selectionAfter,
      metadata,
      operationsOwned,
    };
  };
  const applyDocumentChangeResult = (
    result: JSONResult,
    operationCount: number,
    applied: ReadonlyArray<JSONPatchOperation>,
    history: DocumentChangeHistoryRecord | null,
  ): void => {
    if (!result.ok) return;
    patchState.lastPatch = operationCount === 0 ? [] : applied;
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
    const record = shouldRecordHistory(operations.length);
    const captureMetadata = shouldCaptureMetadata(record, metadata);
    if (!captureMetadata) {
      const r = rawOps.patch(operations);
      applyDocumentChangeResult(r, operations.length, rawOps.lastApplied, null);
      return r;
    }

    const before = record ? rawOps.state : undefined;
    const selectionBefore = selection.snapSelection();
    const changeMetadata = buildChangeMetadata(
      historyState.activeHistoryMetadata,
      metadata,
      selectionBefore,
      selection.selectionEnabled,
    );
    const r = rawOps.patch(operations, changeMetadata);
    const selectionAfter = selection.snapSelection();
    applyDocumentChangeResult(
      r,
      operations.length,
      rawOps.lastApplied,
      historyRecord(
        record,
        before,
        rawOps.state,
        operations,
        selectionBefore,
        selectionAfter,
        changeMetadata,
        operationsOwned,
      ),
    );
    return r;
  };

  const applyPreviewedDocumentPatch = (
    next: z.output<S>,
    operations: ReadonlyArray<JSONPatchOperation>,
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ): JSONResult => {
    const record = shouldRecordHistory(operations.length);
    const captureMetadata = shouldCaptureMetadata(record, metadata);
    if (!captureMetadata) {
      const r = rawOps.trustedApply(next, applied);
      applyDocumentChangeResult(r, applied.length, rawOps.lastApplied, null);
      return r;
    }

    const before = record ? rawOps.state : undefined;
    const selectionBefore = selection.snapSelection();
    const changeMetadata = buildChangeMetadata(
      historyState.activeHistoryMetadata,
      metadata,
      selectionBefore,
      selection.selectionEnabled,
    );
    const r = rawOps.trustedApply(next, applied, changeMetadata);
    const selectionAfter = selection.snapSelection();
    applyDocumentChangeResult(
      r,
      applied.length,
      rawOps.lastApplied,
      historyRecord(
        record,
        before,
        next,
        operations,
        selectionBefore,
        selectionAfter,
        changeMetadata,
      ),
    );
    return r;
  };

  const patch = (operations: JSONPatchInput, metadata?: JSONChangeMetadata): JSONResult => {
    return Array.isArray(operations)
      ? applyDocumentPatch(operations, metadata, false)
      : applyDocumentPatch([operations as JSONPatchOperation], metadata, true);
  };

  const commit = (
    operations: ReadonlyArray<JSONPatchOperation>,
    commitOptions?: JSONDocumentCommitOptions,
  ): JSONResult => {
    const metadata = commitOptions === undefined ? undefined : compactHistoryMetadata(commitOptions);
    if (commitOptions?.selection === undefined) return applyDocumentPatch(operations, metadata);
    const before = rawOps.state;
    const selectionBefore = selection.snapSelection();
    const predicted = rawOps.previewPatch(operations);
    if (!predicted.result.ok) return patch(operations, metadata);
    const selectionAfter = restoreSelection(commitOptions.selection, selection.selectionMode, predicted.state);
    const directMetadata: JSONChangeMetadata = metadata === undefined
      ? { selectionAfter }
      : { ...metadata, selectionAfter };
    const changeMetadata = buildChangeMetadata(
      historyState.activeHistoryMetadata,
      directMetadata,
      selectionBefore,
      selection.selectionEnabled,
    );
    const r = rawOps.trustedApply(predicted.state as z.output<S>, predicted.applied, changeMetadata);
    if (!r.ok) return r;
    selection.restoreSelection(selectionAfter);
    applyDocumentChangeResult(
      r,
      operations.length,
      rawOps.lastApplied,
      historyRecord(
        shouldRecordHistory(operations.length),
        before,
        predicted.state,
        operations,
        selectionBefore,
        selectionAfter,
        changeMetadata,
      ),
    );
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
    const record = shouldRecordHistory(planned.patch.length);
    const captureMetadata = shouldCaptureMetadata(record, undefined);
    const selectionBefore = captureMetadata ? selection.snapSelection() : EMPTY_SELECTION;
    const changeMetadata = captureMetadata
      ? buildChangeMetadata(
          historyState.activeHistoryMetadata,
          undefined,
          selectionBefore,
          selection.selectionEnabled,
        )
      : undefined;
    const r = rawOps.trustedApply(planned.next, planned.patch, changeMetadata);
    const selectionAfter = captureMetadata ? selection.snapSelection() : EMPTY_SELECTION;
    applyDocumentChangeResult(
      r,
      planned.patch.length,
      rawOps.lastApplied,
      historyRecord(
        record,
        before,
        planned.next,
        planned.patch,
        selectionBefore,
        selectionAfter,
        changeMetadata,
      ),
    );
    return r.ok
      ? {
          ok: true,
          value: rawOps.state,
          applied: patchState.lastPatch,
          duplicatedTo: planned.duplicatedTo,
        }
      : r;
  };

  return { applyDocumentPatch, applyPreviewedDocumentPatch, patch, commit, duplicate };
}
