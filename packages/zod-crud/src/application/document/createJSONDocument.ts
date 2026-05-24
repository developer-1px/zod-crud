// Headless JSONDocument facade.
// React 의존 없이 useJSONDocument 와 같은 편집 표면을 제공한다.

import type * as z from "zod";

import { buildCheck, type CheckPasteExecutionOptions, type CheckResult } from "./check.js";
import type {
  JSONPatchOperation,
  JSONResult,
} from "../../foundation/json-patch/index.js";
import { computeInverses } from "../../foundation/json-patch/inverse.js";
import { readAt, tryParsePointer, type Pointer } from "../../foundation/json-pointer/index.js";
import {
  EMPTY_SELECTION,
  reduceSelection,
  restoreSelection,
  type SelectionAction,
  type SelectionMode,
  type SelectionSource,
  type SelectionSnap,
} from "../../domain/selection/index.js";
import {
  backEntry,
  canRedoMutable,
  canUndoMutable,
  commitMutable as commitHistory,
  emptyMutableHistory,
  forwardEntry,
  historyDepth,
  moveBack,
  moveForward,
  redoDepth,
  type MutableHistoryStack,
} from "../../foundation/history.js";
import { INTERNAL_CLIPBOARD_PEEK, createClipboard, type ClipboardPeekResult, type ClipboardState } from "./clipboard.js";
import { createJSON } from "./createJSON.js";
import { buildReadFacade, type EntriesResult, type QueryResult, type ReadResult } from "./read.js";
import { createSchemaState, type SchemaState } from "./schema.js";
import { createSelection, type SelectionState, type UseSelectionOptions } from "./selection.js";
import { isPlainStructuralSchemaForLocalValidation } from "../../domain/schema/localPatch.js";
import {
  duplicate as duplicateVerb,
  type DuplicateError,
  type DuplicateOpts,
} from "../../domain/verbs/duplicate.js";
import type { PasteOptions, PasteTarget } from "../../domain/verbs/paste.js";
import type { JSONCrudError } from "../../foundation/errors.js";
import type {
  HistoryTransactionOptions,
  JSONChangeMetadata,
  JSONOps,
} from "./ops.js";

export interface UseJSONDocumentOptions {
  strict?: boolean | undefined;
  onError?: (error: JSONCrudError) => void;
  /**
   * Treat `initial` as already-validated `z.output<S>`.
   * This skips the initial schema parse; use only when the caller owns that boundary.
   */
  trustedInitial?: boolean | undefined;
  history?: number;
  selection?: boolean | UseSelectionOptions;
  onChange?: () => void;
}

export interface PlanDocumentSelectionRuntimeInput {
  selection: UseJSONDocumentOptions["selection"];
  onChange: UseJSONDocumentOptions["onChange"];
}

export interface DocumentSelectionRuntimePlan {
  selectionEnabled: boolean;
  selectionMode: SelectionMode;
  createSelectionOptions: UseSelectionOptions & {
    onChange?: () => void;
    applyMetadataSelectionAfter: true;
  };
}

type TrustedInitialDocumentOptions = UseJSONDocumentOptions & { trustedInitial: true };
type UntrustedInitialDocumentOptions = UseJSONDocumentOptions & { trustedInitial?: false | undefined };

export interface JSONDocumentHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
  undo(): boolean;
  redo(): boolean;
  mergeLast(options?: { mergeKey?: string }): boolean;
  transaction(fn: () => void): void;
  transaction(options: HistoryTransactionOptions, fn: () => void): void;
}

export interface JSONDocumentCommitOptions extends HistoryTransactionOptions {
  /**
   * Final model selection for this edit. When present, it overrides mutation
   * auto-selection and is recorded in the same history entry as the patch.
   */
  selection?: SelectionAction | SelectionSnap;
}

export interface PlanDocumentCommitRouteInput {
  options: JSONDocumentCommitOptions | undefined;
}

export type DocumentCommitRoutePlan =
  | { kind: "patch"; metadata: HistoryTransactionOptions | undefined }
  | {
      kind: "selection";
      metadata: HistoryTransactionOptions | undefined;
      selection: SelectionAction | SelectionSnap;
    };

export interface PlanDocumentCommitSelectionInput {
  activeHistoryMetadata: HistoryTransactionOptions | undefined;
  metadata: HistoryTransactionOptions | undefined;
  selection: SelectionAction | SelectionSnap;
  selectionBefore: SelectionSnap;
  state: unknown;
  selectionMode: SelectionMode;
  selectionEnabled: boolean;
}

export interface DocumentCommitSelectionPlan {
  selectionAfter: SelectionSnap;
  changeMetadata: JSONChangeMetadata | undefined;
}

export interface PlanDocumentCommitPreviewInput {
  result: JSONResult;
  state: unknown;
  applied: ReadonlyArray<JSONPatchOperation>;
}

export type DocumentCommitPreviewPlan =
  | { kind: "fallbackPatch" }
  | {
      kind: "trustedApply";
      state: unknown;
      applied: ReadonlyArray<JSONPatchOperation>;
    };

export interface DocumentCommitHistoryInput {
  historyLimit: number;
  isRestoring: boolean;
  operationCount: number;
}

export type JSONPatchInput = JSONPatchOperation | ReadonlyArray<JSONPatchOperation>;
export type JSONCapabilityResult = CheckResult;
export type JSONDocumentDuplicateOptions = DuplicateOpts;
export type JSONDocumentDuplicateResult<T> =
  | {
      ok: true;
      value: T;
      applied: ReadonlyArray<JSONPatchOperation>;
      duplicatedTo: Pointer;
    }
  | DuplicateError
  | Extract<JSONResult, { ok: false }>;
export type JSONDocumentPasteOptions = PasteOptions;
export type JSONDocumentPasteTarget = PasteTarget;

export interface PlanDocumentDuplicateApplyResultInput<T> {
  result: JSONResult;
  state: T;
  applied: ReadonlyArray<JSONPatchOperation>;
  duplicatedTo: Pointer;
}

export interface PlanDocumentCanPasteInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  clipboard: ClipboardPeekResult;
  target: JSONDocumentPasteTarget;
  options?: JSONDocumentPasteOptions;
}

export type DocumentCanPastePlan =
  | { kind: "result"; result: JSONCapabilityResult }
  | {
      kind: "check";
      payload: unknown;
      target: JSONDocumentPasteTarget;
      options: JSONDocumentPasteOptions;
      executionOptions: CheckPasteExecutionOptions;
    };

export interface PlanDocumentPatchCallInput {
  operations: JSONPatchInput;
}

export interface DocumentPatchCallPlan {
  operations: ReadonlyArray<JSONPatchOperation>;
  operationsOwned: boolean;
}

export interface JSONDocument<T> {
  readonly value: T;
  readonly lastPatch: ReadonlyArray<JSONPatchOperation>;
  readonly selection: SelectionState | undefined;
  readonly history: JSONDocumentHistory;
  readonly clipboard: ClipboardState<T>;
  readonly schema: SchemaState;
  patch(operations: JSONPatchInput, metadata?: JSONChangeMetadata): JSONResult;
  commit(operations: ReadonlyArray<JSONPatchOperation>, options?: JSONDocumentCommitOptions): JSONResult;
  duplicate(source: Pointer, options?: JSONDocumentDuplicateOptions): JSONDocumentDuplicateResult<T>;
  load(value: T, options?: { preserveHistory?: boolean }): JSONResult;
  reset(value?: T): JSONResult;
  subscribe(listener: (
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ) => void): () => void;
  at(path: Pointer): ReadResult;
  exists(path: Pointer): boolean;
  query(jsonpath: string): QueryResult;
  entries(path: Pointer): EntriesResult;
  canPatch(operations: JSONPatchInput): JSONCapabilityResult;
  canFind(jsonpath: string): JSONCapabilityResult;
  canReplace(path: Pointer, value: unknown): JSONCapabilityResult;
  canRemove(source: SelectionSource): JSONCapabilityResult;
  canMove(source: Pointer, target: Pointer): JSONCapabilityResult;
  canDuplicate(source: Pointer, options?: JSONDocumentDuplicateOptions): JSONCapabilityResult;
  canCopy(source: SelectionSource): JSONCapabilityResult;
  canCut(source: SelectionSource): JSONCapabilityResult;
  canPaste(target: JSONDocumentPasteTarget, options?: JSONDocumentPasteOptions): JSONCapabilityResult;
  canPastePayload(target: JSONDocumentPasteTarget, payload: unknown, options?: JSONDocumentPasteOptions): JSONCapabilityResult;
  canUndo(): JSONCapabilityResult;
  canRedo(): JSONCapabilityResult;
}

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
  metadata?: HistoryTransactionOptions;
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

const ROOT_BULK_HISTORY_SNAPSHOT_THRESHOLD = 512;

export function createJSONDocument<S extends z.ZodType>(
  schema: S,
  initial: z.output<S>,
  options: TrustedInitialDocumentOptions,
): JSONDocument<z.output<S>>;
export function createJSONDocument<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options?: UntrustedInitialDocumentOptions,
): JSONDocument<z.output<S>>;
export function createJSONDocument<S extends z.ZodType>(
  schema: S,
  initial: z.input<S> | z.output<S>,
  options: UseJSONDocumentOptions = {},
): JSONDocument<z.output<S>> {
  const json = createJSON(schema, initial, options);
  const rawOps = json.ops;
  const historyLimit = options.history ?? 0;
  let stack: MutableHistoryStack<HistoryEntry> = emptyMutableHistory<HistoryEntry>();
  let isRestoring = false;
  let activeHistoryMetadata: HistoryTransactionOptions | undefined;
  let activeTransactionStartDepth: number | undefined;
  let lastPatch: ReadonlyArray<JSONPatchOperation> = [];
  let documentSubscriberCount = 0;

  const selectionRuntime = planDocumentSelectionRuntime({
    selection: options.selection,
    onChange: options.onChange,
  });
  const { selectionEnabled, selectionMode, createSelectionOptions } = selectionRuntime;
  const selectionState = selectionEnabled
    ? createSelection<z.output<S>>(rawOps, createSelectionOptions)
    : undefined;
  const syncLastPatch = (): void => {
    lastPatch = rawOps.lastApplied;
  };
  const snapSelection = (): SelectionSnap => selectionState?.snapshot() ?? EMPTY_SELECTION;

  const recordHistory = (
    before: z.output<S>,
    after: z.output<S>,
    operations: ReadonlyArray<JSONPatchOperation>,
    selectionBefore: SelectionSnap,
    selectionAfter: SelectionSnap,
    metadata?: HistoryTransactionOptions,
    operationsOwned = false,
  ): void => {
    const historyMetadata = metadata === undefined ? undefined : compactHistoryMetadata(metadata);
    const currentDepth = historyDepth(stack);
    const fastPath = planDocumentTransactionAppendFastPath({
      activeTransactionStartDepth,
      currentDepth,
      previous: stack.undo[stack.undo.length - 1],
      operations,
      selectionAfter,
      metadata: historyMetadata,
    });
    if (fastPath.kind === "replaceLast") {
      stack.undo[stack.undo.length - 1] = fastPath.entry;
      return;
    }

    const entry = planDocumentHistoryEntry({
      before,
      after,
      operations,
      selectionBefore,
      selectionAfter,
      ...(historyMetadata !== undefined ? { metadata: historyMetadata } : {}),
      ...(operationsOwned ? { operationsOwned } : {}),
    });
    const appendPlan = planDocumentHistoryAppend({
      activeTransactionStartDepth,
      currentDepth,
      previous: stack.undo[stack.undo.length - 1],
      entry,
    });
    if (appendPlan.kind === "skip") return;
    if (appendPlan.kind === "replaceLast") {
      stack.undo[stack.undo.length - 1] = appendPlan.entry;
      return;
    }
    commitHistory(stack, appendPlan.entry, historyLimit);
  };

  const applyDocumentChangePlan = (plan: DocumentChangeApplyResultPlan): void => {
    if (plan.lastPatch !== null) lastPatch = plan.lastPatch;
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
      isRestoring,
      operationCount: operations.length,
      activeHistoryMetadata,
      metadata,
      selectionEnabled,
      documentSubscriberCount,
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
    const selectionBefore = snapSelection();
    const changeMetadata = planDocumentChangeMetadata({
      shouldCaptureMetadata: capture.shouldCaptureMetadata,
      activeHistoryMetadata,
      metadata,
      selectionBefore,
      selectionEnabled,
    });
    const r = rawOps.patch(operations, changeMetadata);
    const selectionAfter = snapSelection();
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
      isRestoring,
      operationCount: operations.length,
      activeHistoryMetadata,
      metadata,
      selectionEnabled,
      documentSubscriberCount,
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
    const selectionBefore = snapSelection();
    const changeMetadata = planDocumentChangeMetadata({
      shouldCaptureMetadata: capture.shouldCaptureMetadata,
      activeHistoryMetadata,
      metadata,
      selectionBefore,
      selectionEnabled,
    });
    const r = rawOps.trustedApply(next, applied, changeMetadata);
    const selectionAfter = snapSelection();
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
    const selectionBefore = snapSelection();
    const predicted = rawOps.previewPatch(operations);
    const preview = planDocumentCommitPreview(predicted);
    if (preview.kind === "fallbackPatch") return patch(operations, route.metadata);

    const plan = planDocumentCommitSelection({
      activeHistoryMetadata,
      metadata: route.metadata,
      selection: route.selection,
      selectionBefore,
      state: preview.state,
      selectionMode,
      selectionEnabled,
    });
    const r = rawOps.trustedApply(preview.state as z.output<S>, preview.applied, plan.changeMetadata);
    if (!r.ok) return r;

    selectionState?.restore(plan.selectionAfter);
    applyDocumentChangePlan(planDocumentChangeApplyResult({
      result: r,
      lastPatchOperationCount: operations.length,
      applied: rawOps.lastApplied,
      history: planDocumentChangeHistoryRecord({
        shouldRecordHistory: shouldRecordDocumentCommitHistory({
          historyLimit,
          isRestoring,
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
      isRestoring,
      operationCount: planned.patch.length,
      activeHistoryMetadata,
      metadata: undefined,
      selectionEnabled,
      documentSubscriberCount,
    });
    const selectionBefore = planDocumentChangeSelection({
      shouldCaptureMetadata: capture.shouldCaptureMetadata,
      snapshot: snapSelection,
    });
    const changeMetadata = planDocumentChangeMetadata({
      shouldCaptureMetadata: capture.shouldCaptureMetadata,
      activeHistoryMetadata,
      metadata: undefined,
      selectionBefore,
      selectionEnabled,
    });
    const r = rawOps.trustedApply(planned.next, planned.patch, changeMetadata);
    const selectionAfter = planDocumentChangeSelection({
      shouldCaptureMetadata: capture.shouldCaptureMetadata,
      snapshot: snapSelection,
    });
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
      applied: lastPatch,
      duplicatedTo: planned.duplicatedTo,
    });
  };

  const restore = (direction: "undo" | "redo"): boolean => {
    const flow = planDocumentHistoryRestoreFlow({ direction });
    const restoreStack = flow.entryStack === "undo" ? stack.undo : stack.redo;
    const entry = flow.entryStack === "undo" ? backEntry(stack) : forwardEntry(stack);
    if (!entry) return false;
    const plan = planDocumentHistoryRestore({
      direction,
      entry,
      currentState: rawOps.state,
      currentSelection: snapSelection(),
    });
    if (flow.writeEntryPhase === "beforeApply") {
      restoreStack[restoreStack.length - 1] = plan.entry;
    }
    isRestoring = true;
    let completion: DocumentHistoryRestoreCompletionPlan | null = null;
    try {
      const applyPlan = planDocumentHistoryRestoreApply({
        patch: plan.patch,
        state: plan.state,
      });
      const r = applyPlan.kind === "patch"
        ? rawOps.trustedPatch(applyPlan.patch)
        : rawOps.trustedApply(applyPlan.state as z.output<S>, applyPlan.patch);
      completion = planDocumentHistoryRestoreCompletion({
        result: r,
        flow,
        entry: plan.entry,
        selectionAfter: plan.selectionAfter,
      });
      if (!completion.ok) return false;
      if (completion.writeEntryAfterApply !== null) {
        restoreStack[restoreStack.length - 1] = completion.writeEntryAfterApply;
      }
      if (completion.syncLastPatch) syncLastPatch();
    } catch {
      return false;
    } finally {
      isRestoring = false;
    }
    if (completion === null || !completion.ok) return false;
    if (completion.move === "back") moveBack(stack);
    else moveForward(stack);
    selectionState?.restore(completion.selectionAfter);
    return true;
  };

  const ops: JSONOps<z.output<S>> = {
    add: (path, value) => applyDocumentPatch([{ op: "add", path: path as Pointer, value }], undefined, true),
    remove: (path) => applyDocumentPatch([{ op: "remove", path: path as Pointer }], undefined, true),
    replace: (path, value) => applyDocumentPatch([{ op: "replace", path: path as Pointer, value }], undefined, true),
    move: (from, path) => applyDocumentPatch([{ op: "move", from: from as Pointer, path: path as Pointer }], undefined, true),
    copy: (from, path) => applyDocumentPatch([{ op: "copy", from: from as Pointer, path: path as Pointer }], undefined, true),
    test: rawOps.test,
    patch: applyDocumentPatch,
    load(value, loadOptions?: { preserveHistory?: boolean }) {
      const r = rawOps.load(value);
      const plan = planDocumentLifecycleChange({
        result: r,
        preserveHistory: loadOptions?.preserveHistory === true,
      });
      if (plan.syncLastPatch) syncLastPatch();
      if (plan.clearHistory) stack = emptyMutableHistory<HistoryEntry>();
      return r;
    },
    reset(value) {
      const r = rawOps.reset(value);
      const plan = planDocumentLifecycleChange({ result: r, preserveHistory: false });
      if (plan.syncLastPatch) syncLastPatch();
      if (plan.clearHistory) stack = emptyMutableHistory<HistoryEntry>();
      return r;
    },
    subscribe(listener) {
      const subscribePlan = planDocumentSubscriptionChange({
        event: "subscribe",
        subscriberCount: documentSubscriberCount,
        subscribed: false,
      });
      documentSubscriberCount = subscribePlan.subscriberCount;
      const unsubscribe = rawOps.subscribe((applied, metadata) => {
        lastPatch = applied;
        listener(applied, planDocumentSubscriptionMetadata({
          metadata,
          selectionAfter: snapSelection(),
        }));
      });
      let subscribed = subscribePlan.subscribed;
      return () => {
        const unsubscribePlan = planDocumentSubscriptionChange({
          event: "unsubscribe",
          subscriberCount: documentSubscriberCount,
          subscribed,
        });
        documentSubscriberCount = unsubscribePlan.subscriberCount;
        subscribed = unsubscribePlan.subscribed;
        if (unsubscribePlan.shouldCallUnderlyingUnsubscribe) unsubscribe();
      };
    },
    get state() { return rawOps.state; },
  };

  const historyControls = {
    undo: () => restore("undo"),
    redo: () => restore("redo"),
    canUndo: () => canUndoMutable(stack),
    canRedo: () => canRedoMutable(stack),
  };

  const mergeLast = (mergeOptions?: { mergeKey?: string }): boolean => {
    const merged = planDocumentHistoryMergeLast({
      isRestoring,
      historyDepth: historyDepth(stack),
      previous: stack.undo[stack.undo.length - 2],
      top: stack.undo[stack.undo.length - 1],
      ...(mergeOptions !== undefined ? { options: mergeOptions } : {}),
    });
    const write = planDocumentHistoryMergeLastWrite({
      undoLength: stack.undo.length,
      merged,
    });
    if (write.kind === "skip") return false;
    stack.undo[write.index] = write.entry;
    stack.undo.length = write.length;
    return true;
  };

  const mergeTransactionEntries = (depthBefore: number): void => {
    const range = planDocumentTransactionMergeRange({
      undoStart: stack.undoStart,
      undoLength: stack.undo.length,
      depthBefore,
      currentDepth: historyDepth(stack),
    });
    if (range === null) return;
    const merged = planDocumentTransactionMerge({ entries: stack.undo, start: range.start, end: range.end });
    const write = planDocumentTransactionMergeWrite({ range, merged });
    if (write.kind === "skip") return;
    stack.undo[write.index] = write.entry;
    stack.undo.length = write.length;
  };

  const withHistoryMetadata = (metadata: HistoryTransactionOptions | undefined, fn: () => void): void => {
    const previous = activeHistoryMetadata;
    activeHistoryMetadata = planDocumentActiveHistoryMetadata({
      active: previous,
      next: metadata,
    });
    try {
      fn();
    } finally {
      activeHistoryMetadata = previous;
    }
  };

  const transaction = (
    optionsOrFn: HistoryTransactionOptions | (() => void),
    maybeFn?: () => void,
  ): void => {
    const call = planDocumentTransactionCall({ optionsOrFn, maybeFn });
    if (call.kind === "skip") return;
    const depthBefore = historyDepth(stack);
    const scope = planDocumentTransactionScope({
      activeTransactionStartDepth,
      depthBefore,
    });
    activeTransactionStartDepth = scope.activeTransactionStartDepth;
    try {
      withHistoryMetadata(call.metadata, call.fn);
    } finally {
      activeTransactionStartDepth = scope.restoreTransactionStartDepth;
    }
    mergeTransactionEntries(depthBefore);
  };

  const history: JSONDocumentHistory = {
    get canUndo() { return historyControls.canUndo(); },
    get canRedo() { return historyControls.canRedo(); },
    get undoDepth() { return historyDepth(stack); },
    get redoDepth() { return redoDepth(stack); },
    undo: () => restore("undo"),
    redo: () => restore("redo"),
    mergeLast,
    transaction,
  };

  const activeSelection = selectionState;
  const selectionRef = activeSelection
    ? { get current() { return activeSelection; } }
    : undefined;
  const check = buildCheck({
    schema,
    ops,
    previewPatch: rawOps.previewPatch,
    previewTrustedValuesPatch: rawOps.previewTrustedValuesPatch,
    getStateJsonTrusted: () => rawOps.stateJsonTrusted,
    history: historyControls,
    ...(selectionRef ? { selectionRef } : {}),
  });
  const clipboardOptions = {
    schema,
    getState: () => rawOps.state,
    ops,
    previewPatch: rawOps.previewPatch,
    previewTrustedValuesPatch: rawOps.previewTrustedValuesPatch,
    applyPreviewedPatch: applyPreviewedDocumentPatch,
    getSelectionSource: () => selectionState?.selectedSource ?? null,
    getSelectionTarget: () => selectionState?.primaryPointer ?? null,
    getAppliedPatch: () => lastPatch,
    getStateJsonTrusted: () => rawOps.stateJsonTrusted,
  };
  const clipboard = createClipboard(options.onChange === undefined
    ? clipboardOptions
    : { ...clipboardOptions, onChange: options.onChange });
  const read = buildReadFacade({ schema, getState: () => rawOps.state });
  const schemaState = createSchemaState({ schema });

  return {
    get value() { return rawOps.state; },
    get lastPatch() { return [...lastPatch]; },
    get selection() { return selectionEnabled ? selectionState : undefined; },
    history,
    clipboard,
    schema: schemaState,
    patch,
    commit,
    duplicate,
    load: ops.load,
    reset: ops.reset,
    subscribe: ops.subscribe,
    at: read.at,
    exists: read.exists,
    query: read.query,
    entries: read.entries,
    canPatch: (operations) => check.patch(planDocumentPatchCall({ operations }).operations),
    canFind: check.find,
    canReplace: check.replace,
    canRemove: check.remove,
    canMove: check.move,
    canDuplicate: check.duplicate,
    canCopy: check.copy,
    canCut: check.cut,
    canPaste: (target, canPasteOptions) => {
      const plan = planDocumentCanPaste({
        schema,
        state: rawOps.state,
        clipboard: clipboard[INTERNAL_CLIPBOARD_PEEK](),
        target,
        ...(canPasteOptions !== undefined ? { options: canPasteOptions } : {}),
      });
      if (plan.kind === "result") return plan.result;
      return check.paste(plan.payload, plan.target, plan.options, plan.executionOptions);
    },
    canPastePayload: (target, payload, canPasteOptions) => check.paste(payload, target, canPasteOptions),
    canUndo: () => check.undo,
    canRedo: () => check.redo,
  };
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
    kind: "check",
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

export function canTrustSameSourceReplaceCanPaste<S extends z.ZodType>(
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

  const replaceTarget = replacePointerTarget(target);
  if (replaceTarget === null || replaceTarget !== read.source) return false;
  const segments = tryParsePointer(replaceTarget);
  return segments !== null && readAt(state, segments).ok;
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

function replacePointerTarget(target: JSONDocumentPasteTarget): Pointer | null {
  return typeof target === "object" && target !== null && "replace" in target
    ? target.replace
    : null;
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
  const selectionAfter = resolveCommitSelection(
    input.selectionBefore,
    input.selection,
    input.state,
    input.selectionMode,
  );
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

function resolveCommitSelection(
  current: SelectionSnap,
  selection: SelectionAction | SelectionSnap,
  state: unknown,
  mode: SelectionMode,
): SelectionSnap {
  return isSelectionSnap(selection)
    ? restoreSelection(selection, mode, state)
    : reduceSelection(current, selection, mode, state);
}

function isSelectionSnap(selection: SelectionAction | SelectionSnap): selection is SelectionSnap {
  return typeof selection === "object"
    && selection !== null
    && "selectionRanges" in selection
    && "selectedPointers" in selection
    && "primaryIndex" in selection;
}

export function shouldCaptureDocumentChangeMetadata(
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

export function planDocumentLastPatch(
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

export function planDocumentTransactionMerge(
  input: PlanDocumentTransactionMergeInput,
): DocumentHistoryEntry | null {
  const { entries, start, end } = input;
  if (start < 0 || end > entries.length || end - start <= 1) return null;

  const first = entries[start]!;
  const last = entries[end - 1]!;
  let forwardLength = 0;
  let inverseLength = 0;
  let metadata: HistoryTransactionOptions | undefined;
  let repeatedReplacePath: Pointer | false | null = null;
  let repeatedReplaceForward: JSONPatchOperation | undefined;
  let repeatedReplaceInverse: JSONPatchOperation | undefined;

  for (let index = start; index < end; index += 1) {
    const entry = entries[index];
    if (entry === undefined) return null;
    forwardLength += entry.forward.length;
    inverseLength += entry.inverse.length;
    if (entry.metadata !== undefined) {
      metadata = repeatedReplacePath === false
        ? mergeGeneralTransactionMetadata(metadata, entry.metadata)
        : mergeRepeatedReplaceTransactionMetadata(metadata, entry.metadata);
    }

    if (repeatedReplacePath !== false) {
      const forward = entry.forward.length === 1 ? entry.forward[0] : undefined;
      const inverse = entry.inverse.length === 1 ? entry.inverse[0] : undefined;
      if (
        forward?.op === "replace"
        && inverse?.op === "replace"
        && forward.path === inverse.path
        && (repeatedReplacePath === null || repeatedReplacePath === forward.path)
      ) {
        repeatedReplacePath = forward.path;
        repeatedReplaceForward = forward;
        repeatedReplaceInverse ??= inverse;
      } else {
        repeatedReplacePath = false;
        metadata = mergeTransactionMetadataRange(entries, start, index + 1);
      }
    }
  }

  if (
    repeatedReplacePath !== false
    && repeatedReplaceForward !== undefined
    && repeatedReplaceInverse !== undefined
  ) {
    const compact: DocumentHistoryEntry = {
      forward: [repeatedReplaceForward],
      inverse: [repeatedReplaceInverse],
      selectionBefore: first.selectionBefore,
      selectionAfter: last.selectionAfter,
    };
    if (first.snapshot !== undefined) compact.snapshot = first.snapshot;
    if (metadata !== undefined) compact.metadata = metadata;
    return compact;
  }

  const forward = new Array<JSONPatchOperation>(forwardLength);
  let forwardIndex = 0;
  for (let entryIndex = start; entryIndex < end; entryIndex += 1) {
    const entryForward = entries[entryIndex]!.forward;
    for (let index = 0; index < entryForward.length; index += 1) {
      forward[forwardIndex] = entryForward[index]!;
      forwardIndex += 1;
    }
  }

  const inverse = new Array<JSONPatchOperation>(inverseLength);
  let inverseIndex = 0;
  for (let entryIndex = end - 1; entryIndex >= start; entryIndex -= 1) {
    const entryInverse = entries[entryIndex]!.inverse;
    for (let index = 0; index < entryInverse.length; index += 1) {
      inverse[inverseIndex] = entryInverse[index]!;
      inverseIndex += 1;
    }
  }

  const merged: DocumentHistoryEntry = {
    forward,
    inverse,
    selectionBefore: first.selectionBefore,
    selectionAfter: last.selectionAfter,
  };
  if (metadata !== undefined) merged.metadata = metadata;
  return merged;
}

export function planDocumentTransactionMergeRange(
  input: PlanDocumentTransactionMergeRangeInput,
): DocumentTransactionMergeRange | null {
  if (input.currentDepth <= input.depthBefore + 1) return null;

  const start = input.undoStart + input.depthBefore;
  const end = input.undoLength;
  if (start < input.undoStart || end - start <= 1) return null;
  return { start, end };
}

export function planDocumentTransactionMergeWrite(
  input: PlanDocumentTransactionMergeWriteInput,
): DocumentTransactionMergeWritePlan {
  if (input.range === null || input.merged === null) return { kind: "skip" };
  return {
    kind: "replaceRange",
    index: input.range.start,
    length: input.range.start + 1,
    entry: input.merged,
  };
}

export function planDocumentTransactionAppendCompact(
  input: PlanDocumentTransactionAppendCompactInput,
): DocumentHistoryEntry | null {
  const { previous, operations } = input;
  if (operations.length !== 1 || !(0 in operations)) return null;

  const op = operations[0]!;
  if (op.op !== "replace") return null;
  if (previous.forward.length !== 1 || previous.inverse.length !== 1) return null;

  const prevForward = previous.forward[0]!;
  const prevInverse = previous.inverse[0]!;
  if (
    prevForward.op !== "replace"
    || prevInverse.op !== "replace"
    || prevForward.path !== prevInverse.path
    || prevForward.path !== op.path
  ) {
    return null;
  }

  const compact: DocumentHistoryEntry = {
    forward: [op],
    inverse: [prevInverse],
    selectionBefore: previous.selectionBefore,
    selectionAfter: input.selectionAfter,
  };
  if (previous.snapshot !== undefined) compact.snapshot = previous.snapshot;
  const metadata = input.metadata === undefined
    ? previous.metadata
    : mergeRepeatedReplaceTransactionMetadata(previous.metadata, input.metadata);
  if (metadata !== undefined) compact.metadata = metadata;
  return compact;
}

export function planDocumentTransactionAppendFastPath(
  input: PlanDocumentTransactionAppendFastPathInput,
): DocumentTransactionAppendFastPathPlan {
  if (
    input.previous === undefined
    || input.activeTransactionStartDepth === undefined
    || input.currentDepth <= input.activeTransactionStartDepth
  ) {
    return { kind: "skip" };
  }

  const compact = planDocumentTransactionAppendCompact({
    previous: input.previous,
    operations: input.operations,
    selectionAfter: input.selectionAfter,
    metadata: input.metadata,
  });
  return compact === null
    ? { kind: "skip" }
    : { kind: "replaceLast", entry: compact };
}

export function planDocumentHistoryEntry(
  input: PlanDocumentHistoryEntryInput,
): DocumentHistoryEntry | null {
  const repeatedReplace = compactRepeatedReplaceBatchForHistory(input.before, input.operations);
  let forward: JSONPatchOperation[];
  let inverseOps: JSONPatchOperation[];
  if (repeatedReplace !== null) {
    forward = repeatedReplace.forward;
    inverseOps = repeatedReplace.inverse;
  } else {
    const inverse = computeInverses(input.before, input.operations);
    if (!inverse.ok) return null;
    forward = input.operationsOwned ? input.operations as JSONPatchOperation[] : [...input.operations];
    inverseOps = inverse.inverses;
  }

  const entry: DocumentHistoryEntry = {
    forward,
    inverse: inverseOps,
    selectionBefore: input.selectionBefore,
    selectionAfter: input.selectionAfter,
  };
  const snapshot = rootBulkHistorySnapshot(input.before, input.after, forward);
  if (snapshot !== null) entry.snapshot = snapshot;
  const historyMetadata = compactHistoryMetadata(input.metadata);
  if (historyMetadata !== undefined) entry.metadata = historyMetadata;
  return entry;
}

export function planDocumentHistoryAppend(
  input: PlanDocumentHistoryAppendInput,
): DocumentHistoryAppendPlan {
  const { entry } = input;
  if (entry === null) return { kind: "skip" };

  if (
    input.previous !== undefined
    && input.activeTransactionStartDepth !== undefined
    && input.currentDepth > input.activeTransactionStartDepth
  ) {
    const compactMetadata = entry.metadata === undefined
      ? input.previous.metadata
      : mergeRepeatedReplaceTransactionMetadata(input.previous.metadata, entry.metadata);
    const compact = planCompactedRepeatedReplaceHistory(input.previous, entry, compactMetadata);
    if (compact !== null) return { kind: "replaceLast", entry: compact };
  }

  return { kind: "commit", entry };
}

export function planDocumentHistoryRestore(
  input: PlanDocumentHistoryRestoreInput,
): DocumentHistoryRestorePlan {
  const { direction, entry } = input;
  const snapshot = entry.snapshot;
  const nextEntry: DocumentHistoryEntry = {
    forward: entry.forward,
    inverse: entry.inverse,
    selectionBefore: entry.selectionBefore,
    selectionAfter: direction === "undo" ? input.currentSelection : entry.selectionAfter,
  };
  if (entry.metadata !== undefined) nextEntry.metadata = entry.metadata;

  if (snapshot !== undefined) {
    nextEntry.snapshot = direction === "undo"
      ? { ...snapshot, after: input.currentState }
      : { before: snapshot.before };
  }

  const plan: DocumentHistoryRestorePlan = {
    patch: direction === "undo" ? entry.inverse : entry.forward,
    selectionAfter: direction === "undo" ? entry.selectionBefore : entry.selectionAfter,
    entry: nextEntry,
  };
  const state = direction === "undo" ? snapshot?.before : snapshot?.after;
  if (state !== undefined) plan.state = state;
  return plan;
}

export function planDocumentHistoryRestoreFlow(
  input: PlanDocumentHistoryRestoreFlowInput,
): DocumentHistoryRestoreFlowPlan {
  return input.direction === "undo"
    ? {
        entryStack: "undo",
        writeEntryPhase: "beforeApply",
        move: "back",
      }
    : {
        entryStack: "redo",
        writeEntryPhase: "afterApply",
        move: "forward",
      };
}

export function planDocumentHistoryRestoreApply(
  input: PlanDocumentHistoryRestoreApplyInput,
): DocumentHistoryRestoreApplyPlan {
  if (input.state === undefined) {
    return {
      kind: "patch",
      patch: input.patch,
    };
  }
  return {
    kind: "state",
    state: input.state,
    patch: input.patch,
  };
}

export function planDocumentHistoryRestoreCompletion(
  input: PlanDocumentHistoryRestoreCompletionInput,
): DocumentHistoryRestoreCompletionPlan {
  if (!input.result.ok) return { ok: false };

  return {
    ok: true,
    writeEntryAfterApply: input.flow.writeEntryPhase === "afterApply" ? input.entry : null,
    syncLastPatch: true,
    move: input.flow.move,
    selectionAfter: input.selectionAfter,
  };
}

function compactRepeatedReplaceBatchForHistory(
  before: unknown,
  operations: ReadonlyArray<JSONPatchOperation>,
): { forward: JSONPatchOperation[]; inverse: JSONPatchOperation[] } | null {
  if (!Array.isArray(operations) || operations.length < 2 || !(0 in operations)) return null;

  const first = operations[0]!;
  if (first.op !== "replace" || typeof first.path !== "string") return null;
  const path = first.path;
  let last = first;
  for (let index = 1; index < operations.length; index += 1) {
    if (!(index in operations)) return null;
    const op = operations[index]!;
    if (op.op !== "replace" || op.path !== path) return null;
    last = op;
  }

  const segments = tryParsePointer(path);
  if (segments === null) return null;
  const previous = readAt(before, segments);
  if (!previous.ok) return null;

  return {
    forward: [last],
    inverse: [{ op: "replace", path, value: previous.value }],
  };
}

function rootBulkHistorySnapshot(
  before: unknown,
  after: unknown,
  forward: ReadonlyArray<JSONPatchOperation>,
): { before: unknown; after?: unknown } | null {
  if (
    forward.length < ROOT_BULK_HISTORY_SNAPSHOT_THRESHOLD
    || before === null
    || typeof before !== "object"
    || Array.isArray(before)
    || after === null
    || typeof after !== "object"
    || Array.isArray(after)
  ) {
    return null;
  }
  return isRootObjectMutationBatch(forward) ? { before } : null;
}

function isRootObjectMutationBatch(operations: ReadonlyArray<JSONPatchOperation>): boolean {
  if (operations.length < ROOT_BULK_HISTORY_SNAPSHOT_THRESHOLD) return false;
  for (let index = 0; index < operations.length; index += 1) {
    if (!(index in operations)) return false;
    const op = operations[index]!;
    if (
      (op.op !== "add" && op.op !== "remove" && op.op !== "replace")
      || typeof op.path !== "string"
      || op.path === ""
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return false;
    }
  }
  return true;
}

export function buildChangeMetadata(
  active: HistoryTransactionOptions | undefined,
  direct: JSONChangeMetadata | undefined,
  selectionBefore: SelectionSnap,
  includeSelectionBefore: boolean,
): JSONChangeMetadata | undefined {
  const metadata = mergeChangeMetadata(active, direct);
  if (!includeSelectionBefore && metadata === undefined) return undefined;
  return {
    ...metadata,
    selectionBefore,
  };
}

function mergeChangeMetadata(
  active: HistoryTransactionOptions | undefined,
  direct: JSONChangeMetadata | undefined,
): JSONChangeMetadata | undefined {
  if (active === undefined) return direct;
  if (direct === undefined) return active;
  return { ...active, ...direct };
}

export function compactHistoryMetadata(
  metadata: HistoryTransactionOptions | undefined,
): HistoryTransactionOptions | undefined {
  if (metadata === undefined) return undefined;
  const { label, origin, mergeKey } = metadata;
  if (label === undefined && origin === undefined && mergeKey === undefined) return undefined;

  const compact: HistoryTransactionOptions = {};
  if (label !== undefined) compact.label = label;
  if (origin !== undefined) compact.origin = origin;
  if (mergeKey !== undefined) compact.mergeKey = mergeKey;
  return compact;
}

export function planDocumentHistoryMergeMetadata(
  input: PlanDocumentHistoryMergeMetadataInput,
): HistoryTransactionOptions | undefined {
  if (input.previous === undefined && input.next === undefined && input.options === undefined) {
    return undefined;
  }
  const merged = { ...input.previous, ...input.next, ...input.options };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function planDocumentHistoryMergeLast(
  input: PlanDocumentHistoryMergeLastInput,
): DocumentHistoryEntry | null {
  if (input.isRestoring || input.historyDepth < 2) return null;
  if (input.previous === undefined || input.top === undefined) return null;
  const metadata = planDocumentHistoryMergeMetadata({
    previous: input.previous.metadata,
    next: input.top.metadata,
    ...(input.options !== undefined ? { options: input.options } : {}),
  });
  return planMergedDocumentHistoryEntry(input.previous, input.top, metadata);
}

export function planDocumentHistoryMergeLastWrite(
  input: PlanDocumentHistoryMergeLastWriteInput,
): DocumentHistoryMergeLastWritePlan {
  if (input.merged === null || input.undoLength < 2) return { kind: "skip" };
  return {
    kind: "replaceLastPair",
    index: input.undoLength - 2,
    length: input.undoLength - 1,
    entry: input.merged,
  };
}

export function planDocumentActiveHistoryMetadata(
  input: PlanDocumentActiveHistoryMetadataInput,
): HistoryTransactionOptions | undefined {
  if (input.next === undefined) return input.active;
  return { ...input.active, ...input.next };
}

export function planDocumentTransactionScope(
  input: PlanDocumentTransactionScopeInput,
): DocumentTransactionScopePlan {
  return {
    activeTransactionStartDepth: input.activeTransactionStartDepth ?? input.depthBefore,
    restoreTransactionStartDepth: input.activeTransactionStartDepth,
  };
}

export function planDocumentTransactionCall(
  input: PlanDocumentTransactionCallInput,
): DocumentTransactionCallPlan {
  if (typeof input.optionsOrFn === "function") {
    return {
      kind: "run",
      metadata: undefined,
      fn: input.optionsOrFn,
    };
  }
  if (input.maybeFn === undefined) return { kind: "skip" };
  return {
    kind: "run",
    metadata: input.optionsOrFn,
    fn: input.maybeFn,
  };
}

function mergeGeneralTransactionMetadata(
  current: HistoryTransactionOptions | undefined,
  next: HistoryTransactionOptions,
): HistoryTransactionOptions {
  return current === undefined ? next : { ...current, ...next };
}

function mergeTransactionMetadataRange(
  entries: ReadonlyArray<DocumentHistoryEntry>,
  start: number,
  end: number,
): HistoryTransactionOptions | undefined {
  let metadata: HistoryTransactionOptions | undefined;
  for (let index = start; index < end; index += 1) {
    const entryMetadata = entries[index]?.metadata;
    if (entryMetadata === undefined) continue;
    metadata = mergeGeneralTransactionMetadata(metadata, entryMetadata);
  }
  return metadata;
}

function mergeRepeatedReplaceTransactionMetadata(
  current: HistoryTransactionOptions | undefined,
  next: HistoryTransactionOptions,
): HistoryTransactionOptions {
  if (current === undefined || sameHistoryMetadata(current, next)) return next;
  return { ...current, ...next };
}

function sameHistoryMetadata(
  left: HistoryTransactionOptions,
  right: HistoryTransactionOptions,
): boolean {
  return left.label === right.label
    && left.origin === right.origin
    && left.mergeKey === right.mergeKey;
}

export function planMergedDocumentHistoryEntry(
  prev: DocumentHistoryEntry,
  top: DocumentHistoryEntry,
  metadata?: HistoryTransactionOptions,
): DocumentHistoryEntry {
  const compact = planCompactedRepeatedReplaceHistory(prev, top, metadata);
  if (compact !== null) return compact;
  return {
    forward: [...prev.forward, ...top.forward],
    inverse: [...top.inverse, ...prev.inverse],
    selectionBefore: prev.selectionBefore,
    selectionAfter: top.selectionAfter,
    ...(metadata ? { metadata } : {}),
  };
}

export function planCompactedRepeatedReplaceHistory(
  prev: DocumentHistoryEntry,
  top: DocumentHistoryEntry,
  metadata?: HistoryTransactionOptions,
): DocumentHistoryEntry | null {
  if (
    prev.forward.length !== 1
    || prev.inverse.length !== 1
    || top.forward.length !== 1
    || top.inverse.length !== 1
  ) {
    return null;
  }

  const prevForward = prev.forward[0]!;
  const prevInverse = prev.inverse[0]!;
  const topForward = top.forward[0]!;
  const topInverse = top.inverse[0]!;
  if (
    prevForward.op !== "replace"
    || prevInverse.op !== "replace"
    || topForward.op !== "replace"
    || topInverse.op !== "replace"
    || prevForward.path !== prevInverse.path
    || topForward.path !== topInverse.path
    || prevForward.path !== topForward.path
  ) {
    return null;
  }

  const entry: DocumentHistoryEntry = {
    forward: [topForward],
    inverse: [prevInverse],
    selectionBefore: prev.selectionBefore,
    selectionAfter: top.selectionAfter,
  };
  if (prev.snapshot !== undefined) entry.snapshot = prev.snapshot;
  if (metadata !== undefined) entry.metadata = metadata;
  return entry;
}
