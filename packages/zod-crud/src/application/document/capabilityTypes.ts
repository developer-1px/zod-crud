import type * as z from "zod";

import type { ApplyResult, ErrorCode, JSONPatchOperation } from "../../foundation/json-patch/index.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import type { PatchPreflightErrorCode } from "../../domain/schema/patchPreflight.js";
import type { ClipboardSource } from "../../domain/verbs/copy.js";
import type { DuplicateOpts } from "../../domain/verbs/duplicate.js";
import type { PasteOptions, PasteTarget } from "../../domain/verbs/paste.js";
import type { SelectionTextEditErrorCode, SelectionTextEditOptions } from "../../domain/selection/textEdit.js";
import type { SelectionTextDeleteOptions } from "../../domain/selection/textDelete.js";
import type {
  SelectionCursorDirection,
  SelectionCursorOptions,
  SelectionScopeOptions,
  SelectionSource,
  SelectionSnap,
} from "../../domain/selection/index.js";
import type { HistoryTransactionOptions, JSONStateOps } from "./stateOps.js";

export type CapabilityErrorCode =
  | ErrorCode
  | PatchPreflightErrorCode
  | SelectionTextEditErrorCode
  | "du_branch_mismatch"
  | "rekey_failed"
  | "missing_new_key"
  | "key_conflict"
  | "empty_selection"
  | "empty_scope"
  | "empty_match"
  | "cursor_boundary"
  | "syntax_error"
  | "empty_stack"
  | "apply_failed"
  | "empty_clipboard";

export interface CapabilityViolation {
  path: string;
  message: string;
}

export type CapabilityResult =
  | { ok: true }
  | {
      ok: false;
      code: CapabilityErrorCode;
      reason?: string;
      pointer?: Pointer;
      violations?: ReadonlyArray<CapabilityViolation>;
    };

export interface DocumentCapabilities {
  selectScope(options?: SelectionScopeOptions): CapabilityResult;
  moveCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): CapabilityResult;
  extendCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): CapabilityResult;
  find(jsonpath: string): CapabilityResult;
  move(fromOrTo: Pointer, to?: Pointer): CapabilityResult;
  duplicate(sourceOrOpts?: Pointer | DuplicateOpts, opts?: DuplicateOpts): CapabilityResult;
  remove(source?: SelectionSource): CapabilityResult;
  replace(pathOrValue: Pointer | unknown, value?: unknown): CapabilityResult;
  replaceText(replacement: string, options?: SelectionTextEditOptions & HistoryTransactionOptions): CapabilityResult;
  deleteText(options?: SelectionTextDeleteOptions & HistoryTransactionOptions): CapabilityResult;
  cut(source?: ClipboardSource): CapabilityResult;
  copy(source?: ClipboardSource): CapabilityResult;
  paste(
    payload: unknown,
    target?: PasteTarget,
    options?: PasteOptions,
    executionOptions?: CapabilityPasteExecutionOptions,
  ): CapabilityResult;
  patch(ops: ReadonlyArray<JSONPatchOperation>): CapabilityResult;

  readonly undo: CapabilityResult;
  readonly redo: CapabilityResult;
}

export interface CapabilityHistoryControls {
  canUndo(): boolean;
  canRedo(): boolean;
}

export interface BuildDocumentCapabilitiesArgs<S extends z.ZodType> {
  schema: S;
  ops: JSONStateOps<z.output<S>>;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  previewTrustedValuesPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  getStateJsonTrusted?: () => boolean;
  history: CapabilityHistoryControls;
  selectionRef?: { current: SelectionSnap };
}

export interface DocumentCapabilityContext<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  selection?: SelectionSnap;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  previewTrustedValuesPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  stateJsonTrusted?: boolean;
}

export interface CapabilityPasteExecutionOptions {
  trustedPayload?: boolean;
}

export interface PlanDocumentPatchCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  operations: ReadonlyArray<JSONPatchOperation>;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface PlanDocumentRemoveCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  source?: SelectionSource;
  selectionSource?: SelectionSource | null;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface PlanDocumentReplaceCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  value: unknown;
  target?: Pointer;
  selectionTarget?: Pointer | null;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface PlanDocumentReplaceArgsInput {
  pathOrValue: Pointer | unknown;
  value: unknown;
  hasValueArg: boolean;
}

export type DocumentReplaceArgsPlan = { target?: Pointer; value: unknown };

export interface PlanDocumentReplaceTextCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  selection: SelectionSnap;
  replacement: string;
  options?: SelectionTextEditOptions & HistoryTransactionOptions;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface PlanDocumentDeleteTextCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  selection: SelectionSnap;
  options?: SelectionTextDeleteOptions & HistoryTransactionOptions;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface PlanDocumentMoveCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  target: Pointer;
  source?: Pointer;
  selectionSource?: Pointer | null;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface PlanDocumentDuplicateCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  source?: Pointer;
  selectionSource?: Pointer | null;
  options?: DuplicateOpts;
  stateJsonTrusted?: boolean;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface PlanDocumentCopyCapabilityInput {
  state: unknown;
  source?: ClipboardSource;
  selectionSource?: ClipboardSource | null;
  stateJsonTrusted?: boolean;
}

export interface PlanDocumentCutCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  source?: ClipboardSource;
  selectionSource?: ClipboardSource | null;
  stateJsonTrusted?: boolean;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface PlanDocumentPasteCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  payload: unknown;
  selectionTarget?: Pointer | null;
  target?: PasteTarget;
  options?: PasteOptions;
  trustedPayload?: boolean;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  previewTrustedValuesPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export type DocumentCapabilitySourceResult =
  | { ok: true }
  | {
      ok: false;
      code: CapabilityErrorCode;
      message?: string;
      reason?: string;
      pointer?: Pointer | null;
      violations?: ReadonlyArray<CapabilityViolation>;
    };

export const OK: CapabilityResult = { ok: true };
