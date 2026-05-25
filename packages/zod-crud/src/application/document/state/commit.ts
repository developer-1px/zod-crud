import type * as z from "zod";
import type { JSONPatchOperation, JSONResult } from "../../../foundation/patch/types.js";
import { readAt, tryParsePointer, type Pointer } from "../../../foundation/pointer/index.js";
import { reduceSelection } from "../../../domain/selection/reducer.js";
import { restoreSelection } from "../../../domain/selection/snap.js";
import type { SelectionAction, SelectionMode, SelectionSnap } from "../../../domain/selection/types.js";
import { isPlainStructuralSchemaForLocalValidation } from "../../../domain/schema/validation/schema.js";
import type { ClipboardPeekResult } from "../clipboard/types.js";
import type { CapabilityResult } from "../can/result.js";
import type { CapabilityPasteExecutionOptions } from "../can/types.js";
import type {
  HistoryTransactionOptions,
  JSONChangeMetadata,
  JSONDocumentCommitOptions,
  JSONDocumentDuplicateResult,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
  JSONPatchInput,
  UseSelectionOptions,
} from "../runtime/types.js";
import { buildChangeMetadata, compactHistoryMetadata } from "../history/metadata.js";

interface PlanDocumentCanPasteInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  clipboard: ClipboardPeekResult;
  target: JSONDocumentPasteTarget;
  options?: JSONDocumentPasteOptions;
}

type DocumentCanPastePlan =
  | { kind: "result"; result: CapabilityResult }
  | {
      kind: "capability";
      payload: unknown;
      target: JSONDocumentPasteTarget;
      options: JSONDocumentPasteOptions;
      executionOptions: CapabilityPasteExecutionOptions;
    };

interface PlanDocumentSelectionRuntimeInput {
  selection: boolean | UseSelectionOptions | undefined;
  onChange: (() => void) | undefined;
}

interface DocumentSelectionRuntimePlan {
  selectionEnabled: boolean;
  selectionMode: SelectionMode;
  createSelectionOptions: UseSelectionOptions & {
    onChange?: () => void;
    applyMetadataSelectionAfter: true;
  };
}

interface PlanDocumentPatchCallInput {
  operations: JSONPatchInput;
}

export interface DocumentPatchCallPlan {
  operations: ReadonlyArray<JSONPatchOperation>;
  operationsOwned: boolean;
}

interface PlanDocumentCommitRouteInput {
  options: JSONDocumentCommitOptions | undefined;
}

type DocumentCommitRoutePlan =
  | { kind: "patch"; metadata: HistoryTransactionOptions | undefined }
  | {
      kind: "selection";
      metadata: HistoryTransactionOptions | undefined;
      selection: SelectionAction | SelectionSnap;
    };

interface PlanDocumentCommitSelectionInput {
  activeHistoryMetadata: HistoryTransactionOptions | undefined;
  metadata: HistoryTransactionOptions | undefined;
  selection: SelectionAction | SelectionSnap;
  selectionBefore: SelectionSnap;
  state: unknown;
  selectionMode: SelectionMode;
  selectionEnabled: boolean;
}

interface PlanDocumentCommitSelectionAfterInput {
  current: SelectionSnap;
  selection: SelectionAction | SelectionSnap;
  state: unknown;
  mode: SelectionMode;
}

interface DocumentCommitSelectionPlan {
  selectionAfter: SelectionSnap;
  changeMetadata: JSONChangeMetadata | undefined;
}

interface PlanDocumentCommitPreviewInput {
  result: JSONResult;
  state: unknown;
  applied: ReadonlyArray<JSONPatchOperation>;
}

type DocumentCommitPreviewPlan =
  | { kind: "fallbackPatch" }
  | {
      kind: "trustedApply";
      state: unknown;
      applied: ReadonlyArray<JSONPatchOperation>;
    };

interface DocumentCommitHistoryInput {
  historyLimit: number;
  isRestoring: boolean;
  operationCount: number;
}

interface PlanDocumentDuplicateApplyResultInput<T> {
  result: JSONResult;
  state: T;
  applied: ReadonlyArray<JSONPatchOperation>;
  duplicatedTo: Pointer;
}

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
