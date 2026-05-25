import type * as z from "zod";
import type { CapabilityPasteExecutionOptions } from "./capabilityFacadeTypes.js";
import type { CapabilityResult } from "./capabilityResultTypes.js";
import type { JSONPatchOperation, JSONResult } from "../../foundation/json-patch/types.js";
import type { Pointer } from "../../foundation/json-pointer/pointerCore.js";
import type { SelectionAction, SelectionMode, SelectionSource, SelectionSnap } from "../../domain/selection/selectionTypes.js";
import type { ClipboardPeekResult, ClipboardState } from "./clipboardTypes.js";
import type { EntriesResult, QueryResult, ReadResult } from "./read.js";
import type { SchemaState } from "./schema.js";
import type { SelectionState } from "./selection.js";
import type { UseSelectionOptions } from "./selectionPlan.js";
import type { DuplicateError, DuplicateOpts } from "../../domain/verbs/duplicate.js";
import type { PasteOptions, PasteTarget } from "../../domain/verbs/paste.js";
import type { JSONCrudError } from "../../foundation/errors.js";
import type { HistoryTransactionOptions, JSONChangeMetadata } from "./stateOps.js";

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

export interface PlanDocumentCommitSelectionAfterInput {
  current: SelectionSnap;
  selection: SelectionAction | SelectionSnap;
  state: unknown;
  mode: SelectionMode;
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
export type JSONCapabilityResult = CapabilityResult;
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
      kind: "capability";
      payload: unknown;
      target: JSONDocumentPasteTarget;
      options: JSONDocumentPasteOptions;
      executionOptions: CapabilityPasteExecutionOptions;
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
