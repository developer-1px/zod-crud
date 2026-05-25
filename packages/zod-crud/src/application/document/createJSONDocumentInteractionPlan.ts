import type * as z from "zod";
import type { JSONPatchOperation } from "../../foundation/json-patch/index.js";
import { readAt, tryParsePointer, type Pointer } from "../../foundation/json-pointer/index.js";
import { reduceSelection, restoreSelection, type SelectionAction, type SelectionSnap } from "../../domain/selection/index.js";
import { isPlainStructuralSchemaForLocalValidation } from "../../domain/schema/localSchemaCore.js";
import type { ClipboardPeekResult } from "./clipboardTypes.js";
import type { HistoryTransactionOptions, JSONChangeMetadata } from "./stateOps.js";
import type {
  DocumentCanPastePlan,
  DocumentCommitHistoryInput,
  DocumentCommitPreviewPlan,
  DocumentCommitRoutePlan,
  DocumentCommitSelectionPlan,
  DocumentPatchCallPlan,
  DocumentSelectionRuntimePlan,
  JSONDocumentDuplicateResult,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
  JSONPatchInput,
  PlanDocumentCanPasteInput,
  PlanDocumentCommitPreviewInput,
  PlanDocumentCommitRouteInput,
  PlanDocumentCommitSelectionAfterInput,
  PlanDocumentCommitSelectionInput,
  PlanDocumentDuplicateApplyResultInput,
  PlanDocumentPatchCallInput,
  PlanDocumentSelectionRuntimeInput,
} from "./createJSONDocumentPublicTypes.js";
import type { UseSelectionOptions } from "./selection.js";
import { buildChangeMetadata, compactHistoryMetadata } from "./createJSONDocumentMetadataPlan.js";

export function planDocumentCanPaste<S extends z.ZodType>(
  input: PlanDocumentCanPasteInput<S>,
): DocumentCanPastePlan {
  const read = input.clipboard;
  if (!read.ok) {
    return {
      kind: "result",
      result: {
        ok: false,
        code: "empty_clipboard",
        reason: "clipboard is empty",
      },
    };
  }
  if (canTrustSameSourceReplaceCanPaste(input.schema, input.state, read, input.target, input.options)) {
    return { kind: "result", result: { ok: true } };
  }
  const spread = input.options?.spread ?? ((read.sources?.length ?? 0) > 1);
  return {
    kind: "capability",
    payload: read.payload,
    target: input.target,
    options: { ...input.options, spread },
    executionOptions: { trustedPayload: true },
  };
}

export function planDocumentDuplicateApplyResult<T>(
  input: PlanDocumentDuplicateApplyResultInput<T>,
): JSONDocumentDuplicateResult<T> {
  if (!input.result.ok) return input.result;
  return {
    ok: true,
    value: input.state,
    applied: input.applied,
    duplicatedTo: input.duplicatedTo,
  };
}

function canTrustSameSourceReplaceCanPaste<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  read: Extract<ClipboardPeekResult, { ok: true }>,
  target: JSONDocumentPasteTarget,
  options?: JSONDocumentPasteOptions,
): boolean {
  if (!read.schemaTrusted || read.source === null) return false;
  if ((read.sources?.length ?? 1) !== 1) return false;
  if (options?.rekey !== undefined || options?.spread === true) return false;
  if (!isPlainStructuralSchemaForLocalValidation(schema)) return false;

  const replaceTarget = planDocumentPasteReplaceTarget(target);
  if (replaceTarget === null || replaceTarget !== read.source) return false;
  const segments = tryParsePointer(replaceTarget);
  return segments !== null && readAt(state, segments).ok;
}

function planDocumentPasteReplaceTarget(target: JSONDocumentPasteTarget): Pointer | null {
  return typeof target === "object" && target !== null && "replace" in target
    ? target.replace
    : null;
}

export function planDocumentSelectionRuntime(
  input: PlanDocumentSelectionRuntimeInput,
): DocumentSelectionRuntimePlan {
  const selectionEnabled = input.selection !== undefined && input.selection !== false;
  const selectionOptions: UseSelectionOptions =
    typeof input.selection === "object" ? input.selection : {};
  const createSelectionOptions: DocumentSelectionRuntimePlan["createSelectionOptions"] = {
    ...selectionOptions,
    applyMetadataSelectionAfter: true,
  };
  if (input.onChange !== undefined) createSelectionOptions.onChange = input.onChange;

  return {
    selectionEnabled,
    selectionMode: selectionOptions.mode ?? "single",
    createSelectionOptions,
  };
}

function isPatchArray(operations: JSONPatchInput): operations is ReadonlyArray<JSONPatchOperation> {
  return Array.isArray(operations);
}

export function planDocumentPatchCall(
  input: PlanDocumentPatchCallInput,
): DocumentPatchCallPlan {
  if (isPatchArray(input.operations)) {
    return {
      operations: input.operations,
      operationsOwned: false,
    };
  }
  return {
    operations: [input.operations],
    operationsOwned: true,
  };
}

export function planDocumentCommitRoute(
  input: PlanDocumentCommitRouteInput,
): DocumentCommitRoutePlan {
  if (input.options === undefined) {
    return { kind: "patch", metadata: undefined };
  }

  const metadata = compactHistoryMetadata(input.options);
  if (input.options.selection === undefined) {
    return { kind: "patch", metadata };
  }
  return {
    kind: "selection",
    metadata,
    selection: input.options.selection,
  };
}

export function planDocumentCommitSelection(
  input: PlanDocumentCommitSelectionInput,
): DocumentCommitSelectionPlan {
  const selectionAfter = planDocumentCommitSelectionAfter({
    current: input.selectionBefore,
    selection: input.selection,
    state: input.state,
    mode: input.selectionMode,
  });
  const directMetadata: JSONChangeMetadata = input.metadata === undefined
    ? { selectionAfter }
    : { ...input.metadata, selectionAfter };
  return {
    selectionAfter,
    changeMetadata: buildChangeMetadata(
      input.activeHistoryMetadata,
      directMetadata,
      input.selectionBefore,
      input.selectionEnabled,
    ),
  };
}

function planDocumentCommitSelectionAfter(
  input: PlanDocumentCommitSelectionAfterInput,
): SelectionSnap {
  return isDocumentSelectionSnapshot(input.selection)
    ? restoreSelection(input.selection, input.mode, input.state)
    : reduceSelection(input.current, input.selection, input.mode, input.state);
}

export function planDocumentCommitPreview(
  input: PlanDocumentCommitPreviewInput,
): DocumentCommitPreviewPlan {
  if (!input.result.ok) return { kind: "fallbackPatch" };
  return {
    kind: "trustedApply",
    state: input.state,
    applied: input.applied,
  };
}

export function shouldRecordDocumentCommitHistory(
  input: DocumentCommitHistoryInput,
): boolean {
  return input.historyLimit > 0
    && !input.isRestoring
    && input.operationCount > 0;
}

function isDocumentSelectionSnapshot(selection: SelectionAction | SelectionSnap): selection is SelectionSnap {
  return typeof selection === "object"
    && selection !== null
    && "selectionRanges" in selection
    && "selectedPointers" in selection
    && "primaryIndex" in selection;
}
