import type * as z from "zod";

import type { ApplyResult, JSONPatchOperation, ErrorCode } from "../../foundation/json-patch/index.js";
import { removeSourcesPatch } from "../../foundation/json-patch/removeSources.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import type { PointerSourceError } from "../../foundation/json-pointer/pointerSource.js";
import {
  patchPreflight,
  patchPreflightFromApplyResult,
  type PatchPreflightErrorCode,
} from "../../domain/schema/patchPreflight.js";
import type { HistoryTransactionOptions, JSONStateOps } from "./stateOps.js";
import { copy, type ClipboardSource } from "../../domain/verbs/copy.js";
import { cut } from "../../domain/verbs/cut.js";
import { duplicate, resolveDuplicateArgs, type DuplicateOpts } from "../../domain/verbs/duplicate.js";
import { move as moveVerb, resolveMoveArgs } from "../../domain/verbs/move.js";
import { paste, rekeyProducesTrustedPayload, resolvePasteArgs, type PasteOptions, type PasteTarget } from "../../domain/verbs/paste.js";
import { replace as replaceVerb } from "../../domain/verbs/replace.js";
import {
  deleteSelectionText,
  replaceSelectionText,
  type SelectionTextDeleteOptions,
  type SelectionTextEditErrorCode,
  type SelectionTextEditOptions,
} from "../../domain/selection/textEdit.js";
import {
  EMPTY_SELECTION,
  primaryPointer,
  resolveSelectionCursor,
  resolveSelectionScope,
  selectedSource,
  type SelectionCursorDirection,
  type SelectionCursorOptions,
  type SelectionScopeOptions,
  type SelectionSource,
  type SelectionSnap,
} from "../../domain/selection/index.js";
import { JSONPathSyntaxError, parse as parseJSONPath } from "../../foundation/jsonpath/index.js";

type CapabilityErrorCode =
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

interface CapabilityViolation {
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

interface DocumentCapabilities {
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

interface CapabilityHistoryControls {
  canUndo(): boolean;
  canRedo(): boolean;
}

interface BuildDocumentCapabilitiesArgs<S extends z.ZodType> {
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

const OK: CapabilityResult = { ok: true };

export function buildDocumentCapabilities<S extends z.ZodType>(
  args: BuildDocumentCapabilitiesArgs<S>,
): DocumentCapabilities {
  const { schema, ops, previewPatch, previewTrustedValuesPatch, getStateJsonTrusted, history, selectionRef } = args;
  const context = (): DocumentCapabilityContext<S> => {
    const current: DocumentCapabilityContext<S> = {
      schema,
      state: ops.state,
      stateJsonTrusted: getStateJsonTrusted?.() === true,
    };
    if (selectionRef !== undefined) current.selection = selectionRef.current;
    if (previewPatch !== undefined) current.previewPatch = previewPatch;
    if (previewTrustedValuesPatch !== undefined) current.previewTrustedValuesPatch = previewTrustedValuesPatch;
    return current;
  };

  return {
    selectScope(options) {
      return canDocumentSelectScope(context(), options);
    },
    moveCursor(direction, options) {
      return canDocumentMoveCursor(context(), direction, options);
    },
    extendCursor(direction, options) {
      return canDocumentExtendCursor(context(), direction, options);
    },
    find(jsonpath) {
      return canDocumentFind(jsonpath);
    },
    move(fromOrTo, maybeTo) {
      return canDocumentMove(context(), fromOrTo, maybeTo, arguments.length >= 2);
    },
    duplicate(sourceOrOpts, opts) {
      return canDocumentDuplicate(context(), sourceOrOpts, opts);
    },
    remove(source) {
      return canDocumentRemove(context(), source);
    },
    replace(pathOrValue, maybeValue) {
      return canDocumentReplace(context(), pathOrValue, maybeValue, arguments.length >= 2);
    },
    replaceText(replacement, textOptions) {
      return canDocumentReplaceText(context(), replacement, textOptions);
    },
    deleteText(textOptions) {
      return canDocumentDeleteText(context(), textOptions);
    },
    cut(source) {
      return canDocumentCut(context(), source);
    },
    copy(source) {
      return canDocumentCopy(context(), source);
    },
    paste(payload, target, options, executionOptions) {
      return canDocumentPaste(context(), payload, target, options, executionOptions);
    },
    patch(operations) {
      return canDocumentPatch(context(), operations);
    },

    get undo() {
      return history.canUndo() ? OK : emptyStack("undo");
    },
    get redo() {
      return history.canRedo() ? OK : emptyStack("redo");
    },
  };
}

export function canDocumentSelectScope<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  options?: SelectionScopeOptions,
): CapabilityResult {
  return planDocumentCapabilityResult(resolveSelectionScope(context.state, options));
}

export function canDocumentMoveCursor<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  direction: SelectionCursorDirection,
  options?: SelectionCursorOptions,
): CapabilityResult {
  return planDocumentCapabilityResult(resolveSelectionCursor(selectionState(context), direction, context.state, options));
}

export function canDocumentExtendCursor<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  direction: SelectionCursorDirection,
  options?: SelectionCursorOptions,
): CapabilityResult {
  return planDocumentCapabilityResult(resolveSelectionCursor(selectionState(context), direction, context.state, options));
}

export function canDocumentFind(jsonpath: string): CapabilityResult {
  try {
    parseJSONPath(jsonpath);
    return OK;
  } catch (error) {
    if (error instanceof JSONPathSyntaxError) {
      return { ok: false, code: "syntax_error", reason: error.message };
    }
    throw error;
  }
}

export function canDocumentMove<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  fromOrTo: Pointer,
  maybeTo?: Pointer,
  hasToArg = arguments.length >= 3,
): CapabilityResult {
  const args = resolveMoveArgs(fromOrTo, maybeTo, hasToArg);
  return planDocumentMoveCapability({
    schema: context.schema,
    state: context.state,
    target: args.to,
    selectionSource: primaryPointer(selectionState(context)),
    ...(args.from !== undefined ? { source: args.from } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function planDocumentMoveCapability<S extends z.ZodType>(
  input: PlanDocumentMoveCapabilityInput<S>,
): CapabilityResult {
  const source = input.source ?? input.selectionSource ?? null;
  return source === null
    ? emptySelection("move source selection is empty")
    : planDocumentCapabilityResult(moveVerb(input.schema, input.state, source, input.target, {
        previewPatch: input.previewPatch,
      }));
}

export function canDocumentDuplicate<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  sourceOrOpts?: Pointer | DuplicateOpts,
  opts?: DuplicateOpts,
): CapabilityResult {
  const args = resolveDuplicateArgs(sourceOrOpts, opts);
  return planDocumentDuplicateCapability({
    schema: context.schema,
    state: context.state,
    selectionSource: primaryPointer(selectionState(context)),
    options: args.opts,
    stateJsonTrusted: trustedState(context),
    ...(args.source !== undefined ? { source: args.source } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function planDocumentDuplicateCapability<S extends z.ZodType>(
  input: PlanDocumentDuplicateCapabilityInput<S>,
): CapabilityResult {
  const source = input.source ?? input.selectionSource ?? null;
  return source === null
    ? emptySelection("duplicate source selection is empty")
    : planDocumentCapabilityResult(duplicate(input.schema, input.state, source, input.options, {
        previewPatch: input.previewPatch,
        trustedPayload: input.stateJsonTrusted === true,
      }));
}

export function canDocumentRemove<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  source?: SelectionSource,
): CapabilityResult {
  return planDocumentRemoveCapability({
    schema: context.schema,
    state: context.state,
    selectionSource: selectedSource(selectionState(context)),
    ...(source !== undefined ? { source } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function planDocumentRemoveCapability<S extends z.ZodType>(
  input: PlanDocumentRemoveCapabilityInput<S>,
): CapabilityResult {
  const resolved = input.source ?? input.selectionSource ?? null;
  if (resolved === null) return emptySelection("remove source selection is empty");
  const planned = removeSourcesPatch(resolved);
  return planned.ok
    ? planDocumentPatchCapability({
        schema: input.schema,
        state: input.state,
        operations: planned.patch,
        ...(input.previewPatch !== undefined ? { previewPatch: input.previewPatch } : {}),
      })
    : planDocumentCapabilityResult(pointerSourceCapabilityError(planned, "remove"));
}

export function canDocumentReplace<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  pathOrValue: Pointer | unknown,
  maybeValue?: unknown,
  hasValueArg = arguments.length >= 3,
): CapabilityResult {
  const args = planDocumentReplaceArgs({
    pathOrValue,
    value: maybeValue,
    hasValueArg,
  });
  return planDocumentReplaceCapability({
    schema: context.schema,
    state: context.state,
    value: args.value,
    selectionTarget: primaryPointer(selectionState(context)),
    ...(args.target !== undefined ? { target: args.target } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function planDocumentReplaceCapability<S extends z.ZodType>(
  input: PlanDocumentReplaceCapabilityInput<S>,
): CapabilityResult {
  if (input.target !== undefined && isDocumentJSONPathTarget(input.target)) {
    return planDocumentCapabilityResult(replaceVerb(input.schema, input.state, input.target, input.value, {
      previewPatch: input.previewPatch,
    }));
  }
  const target = input.target ?? input.selectionTarget ?? null;
  return target === null
    ? emptySelection("replace target selection is empty")
    : planDocumentPatchCapability({
        schema: input.schema,
        state: input.state,
        operations: [{ op: "replace", path: target, value: input.value }],
        ...(input.previewPatch !== undefined ? { previewPatch: input.previewPatch } : {}),
      });
}

export function canDocumentReplaceText<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  replacement: string,
  textOptions?: SelectionTextEditOptions & HistoryTransactionOptions,
): CapabilityResult {
  return planDocumentReplaceTextCapability({
    schema: context.schema,
    state: context.state,
    selection: selectionState(context),
    replacement,
    ...(textOptions !== undefined ? { options: textOptions } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function planDocumentReplaceTextCapability<S extends z.ZodType>(
  input: PlanDocumentReplaceTextCapabilityInput<S>,
): CapabilityResult {
  const planned = replaceSelectionText(input.selection, input.state, input.replacement, input.options);
  return planned.ok
    ? planDocumentPatchCapability({
        schema: input.schema,
        state: input.state,
        operations: planned.patch,
        ...(input.previewPatch !== undefined ? { previewPatch: input.previewPatch } : {}),
      })
    : planDocumentCapabilityResult(planned);
}

export function canDocumentDeleteText<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  textOptions?: SelectionTextDeleteOptions & HistoryTransactionOptions,
): CapabilityResult {
  return planDocumentDeleteTextCapability({
    schema: context.schema,
    state: context.state,
    selection: selectionState(context),
    ...(textOptions !== undefined ? { options: textOptions } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function planDocumentDeleteTextCapability<S extends z.ZodType>(
  input: PlanDocumentDeleteTextCapabilityInput<S>,
): CapabilityResult {
  const planned = deleteSelectionText(input.selection, input.state, input.options);
  return planned.ok
    ? planDocumentPatchCapability({
        schema: input.schema,
        state: input.state,
        operations: planned.patch,
        ...(input.previewPatch !== undefined ? { previewPatch: input.previewPatch } : {}),
      })
    : planDocumentCapabilityResult(planned);
}

export function canDocumentCut<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  source?: ClipboardSource,
): CapabilityResult {
  return planDocumentCutCapability({
    schema: context.schema,
    state: context.state,
    selectionSource: selectedSource(selectionState(context)),
    stateJsonTrusted: trustedState(context),
    ...(source !== undefined ? { source } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function planDocumentCutCapability<S extends z.ZodType>(
  input: PlanDocumentCutCapabilityInput<S>,
): CapabilityResult {
  const resolved = input.source ?? input.selectionSource ?? null;
  return resolved === null
    ? emptySelection("cut source selection is empty")
    : planDocumentCapabilityResult(cut(input.schema, input.state, resolved, {
        trusted: input.stateJsonTrusted === true,
        clonePayload: false,
        previewPatch: input.previewPatch,
      }));
}

export function canDocumentCopy<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  source?: ClipboardSource,
): CapabilityResult {
  return planDocumentCopyCapability({
    state: context.state,
    selectionSource: selectedSource(selectionState(context)),
    stateJsonTrusted: trustedState(context),
    ...(source !== undefined ? { source } : {}),
  });
}

export function planDocumentCopyCapability(
  input: PlanDocumentCopyCapabilityInput,
): CapabilityResult {
  const resolved = input.source ?? input.selectionSource ?? null;
  return resolved === null
    ? emptySelection("copy source selection is empty")
    : planDocumentCapabilityResult(copy(input.state, resolved, {
        trusted: input.stateJsonTrusted === true,
        clonePayload: false,
      }));
}

export function canDocumentPaste<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  payload: unknown,
  target?: PasteTarget,
  options?: PasteOptions,
  executionOptions?: CapabilityPasteExecutionOptions,
): CapabilityResult {
  return planDocumentPasteCapability({
    schema: context.schema,
    state: context.state,
    payload,
    selectionTarget: primaryPointer(selectionState(context)),
    ...(target !== undefined ? { target } : {}),
    ...(options !== undefined ? { options } : {}),
    ...(executionOptions?.trustedPayload !== undefined ? { trustedPayload: executionOptions.trustedPayload } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
    ...(context.previewTrustedValuesPatch !== undefined ? { previewTrustedValuesPatch: context.previewTrustedValuesPatch } : {}),
  });
}

export function planDocumentPasteCapability<S extends z.ZodType>(
  input: PlanDocumentPasteCapabilityInput<S>,
): CapabilityResult {
  const args = resolvePasteArgs(input.target, input.options);
  const resolvedTarget = args.target ?? input.selectionTarget ?? null;
  const inputTrustedPayload = input.trustedPayload === true
    || args.options.trustedPayload === true;
  const patchValuesTrusted = inputTrustedPayload
    || rekeyProducesTrustedPayload(args.options);
  const pastePreview = patchValuesTrusted && input.previewTrustedValuesPatch
    ? input.previewTrustedValuesPatch
    : input.previewPatch;
  return resolvedTarget === null
    ? emptySelection("paste target selection is empty")
    : planDocumentCapabilityResult(paste(input.schema, input.state, input.payload, resolvedTarget, args.mode, {
        ...args.options,
        previewPatch: pastePreview,
        trustedPayload: inputTrustedPayload,
      }));
}

export function canDocumentPatch<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  operations: ReadonlyArray<JSONPatchOperation>,
): CapabilityResult {
  return planDocumentPatchCapability({
    schema: context.schema,
    state: context.state,
    operations,
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function planDocumentPatchCapability<S extends z.ZodType>(
  input: PlanDocumentPatchCapabilityInput<S>,
): CapabilityResult {
  const result = input.previewPatch
    ? patchPreflightFromApplyResult(input.previewPatch(input.operations))
    : patchPreflight(input.schema, input.state, input.operations);
  return planDocumentCapabilityResult(result);
}

function trustedState<S extends z.ZodType>(context: DocumentCapabilityContext<S>): boolean {
  return context.stateJsonTrusted === true;
}

function selectionState<S extends z.ZodType>(context: DocumentCapabilityContext<S>): SelectionSnap {
  return context.selection ?? EMPTY_SELECTION;
}

export function planDocumentCapabilityResult(result: DocumentCapabilitySourceResult): CapabilityResult {
  if (result.ok) return OK;

  const out: Extract<CapabilityResult, { ok: false }> = {
    ok: false,
    code: result.code,
  };
  const reason = result.reason ?? result.message;
  if (reason !== undefined) out.reason = reason;
  if (result.pointer !== undefined && result.pointer !== null) out.pointer = result.pointer;
  if (result.violations !== undefined) out.violations = result.violations;
  return out;
}

function emptyStack(kind: "undo" | "redo"): CapabilityResult {
  return {
    ok: false,
    code: "empty_stack",
    reason: `${kind} stack is empty`,
  };
}

function emptySelection(reason: string): CapabilityResult {
  return {
    ok: false,
    code: "empty_selection",
    reason,
  };
}

function pointerSourceCapabilityError(error: PointerSourceError, label: string): DocumentCapabilitySourceResult {
  return error.code === "invalid_pointer"
    ? { ok: false, code: "invalid_pointer", reason: `invalid ${label} source pointer: ${error.pointer}`, pointer: error.pointer }
    : { ok: false, code: "empty_selection", reason: `${label} source selection is empty` };
}

export function planDocumentReplaceArgs(
  input: PlanDocumentReplaceArgsInput,
): DocumentReplaceArgsPlan {
  return input.hasValueArg
    ? { target: input.pathOrValue as Pointer, value: input.value }
    : { value: input.pathOrValue };
}

export function isDocumentJSONPathTarget(value: Pointer): boolean {
  return value.startsWith("$");
}
