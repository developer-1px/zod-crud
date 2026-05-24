import type * as z from "zod";

import type { ApplyResult, JSONPatchOperation, ErrorCode } from "../../foundation/json-patch/index.js";
import { removeSourcesPatch } from "../../foundation/json-patch/removeSources.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import type { PointerSourceError } from "../../foundation/json-pointer/sourceSet.js";
import {
  preFlight,
  preFlightFromApplyResult,
  type PreFlightErrorCode,
} from "../../domain/schema/preFlight.js";
import type { HistoryTransactionOptions, JSONOps } from "./ops.js";
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

type CheckErrorCode =
  | ErrorCode
  | PreFlightErrorCode
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

interface CheckViolation {
  path: string;
  message: string;
}

export type CheckResult =
  | { ok: true }
  | {
      ok: false;
      code: CheckErrorCode;
      reason?: string;
      pointer?: Pointer;
      violations?: ReadonlyArray<CheckViolation>;
    };

interface Check {
  selectScope(options?: SelectionScopeOptions): CheckResult;
  moveCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): CheckResult;
  extendCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): CheckResult;
  find(jsonpath: string): CheckResult;
  move(fromOrTo: Pointer, to?: Pointer): CheckResult;
  duplicate(sourceOrOpts?: Pointer | DuplicateOpts, opts?: DuplicateOpts): CheckResult;
  remove(source?: SelectionSource): CheckResult;
  replace(pathOrValue: Pointer | unknown, value?: unknown): CheckResult;
  replaceText(replacement: string, options?: SelectionTextEditOptions & HistoryTransactionOptions): CheckResult;
  deleteText(options?: SelectionTextDeleteOptions & HistoryTransactionOptions): CheckResult;
  cut(source?: ClipboardSource): CheckResult;
  copy(source?: ClipboardSource): CheckResult;
  paste(
    payload: unknown,
    target?: PasteTarget,
    options?: PasteOptions,
    executionOptions?: CheckPasteExecutionOptions,
  ): CheckResult;
  patch(ops: ReadonlyArray<JSONPatchOperation>): CheckResult;

  readonly undo: CheckResult;
  readonly redo: CheckResult;
}

interface CheckHistoryControls {
  canUndo(): boolean;
  canRedo(): boolean;
}

interface BuildCheckArgs<S extends z.ZodType> {
  schema: S;
  ops: JSONOps<z.output<S>>;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  previewTrustedValuesPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  getStateJsonTrusted?: () => boolean;
  history: CheckHistoryControls;
  selectionRef?: { current: SelectionSnap };
}

export interface DocumentCheckContext<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  selection?: SelectionSnap;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  previewTrustedValuesPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  stateJsonTrusted?: boolean;
}

export interface CheckPasteExecutionOptions {
  trustedPayload?: boolean;
}

export interface PlanDocumentPasteCheckInput<S extends z.ZodType> {
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

type CheckableResult =
  | { ok: true }
  | {
      ok: false;
      code: CheckErrorCode;
      message?: string;
      reason?: string;
      pointer?: Pointer | null;
      violations?: ReadonlyArray<CheckViolation>;
    };

const OK: CheckResult = { ok: true };

export function buildCheck<S extends z.ZodType>(
  args: BuildCheckArgs<S>,
): Check {
  const { schema, ops, previewPatch, previewTrustedValuesPatch, getStateJsonTrusted, history, selectionRef } = args;
  const context = (): DocumentCheckContext<S> => {
    const current: DocumentCheckContext<S> = {
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
      return checkDocumentSelectScope(context(), options);
    },
    moveCursor(direction, options) {
      return checkDocumentMoveCursor(context(), direction, options);
    },
    extendCursor(direction, options) {
      return checkDocumentExtendCursor(context(), direction, options);
    },
    find(jsonpath) {
      return checkDocumentFind(jsonpath);
    },
    move(fromOrTo, maybeTo) {
      return checkDocumentMove(context(), fromOrTo, maybeTo, arguments.length >= 2);
    },
    duplicate(sourceOrOpts, opts) {
      return checkDocumentDuplicate(context(), sourceOrOpts, opts);
    },
    remove(source) {
      return checkDocumentRemove(context(), source);
    },
    replace(pathOrValue, maybeValue) {
      return checkDocumentReplace(context(), pathOrValue, maybeValue, arguments.length >= 2);
    },
    replaceText(replacement, textOptions) {
      return checkDocumentReplaceText(context(), replacement, textOptions);
    },
    deleteText(textOptions) {
      return checkDocumentDeleteText(context(), textOptions);
    },
    cut(source) {
      return checkDocumentCut(context(), source);
    },
    copy(source) {
      return checkDocumentCopy(context(), source);
    },
    paste(payload, target, options, executionOptions) {
      return checkDocumentPaste(context(), payload, target, options, executionOptions);
    },
    patch(operations) {
      return checkDocumentPatch(context(), operations);
    },

    get undo() {
      return history.canUndo() ? OK : emptyStack("undo");
    },
    get redo() {
      return history.canRedo() ? OK : emptyStack("redo");
    },
  };
}

export function checkDocumentSelectScope<S extends z.ZodType>(
  context: DocumentCheckContext<S>,
  options?: SelectionScopeOptions,
): CheckResult {
  return toCheckResult(resolveSelectionScope(context.state, options));
}

export function checkDocumentMoveCursor<S extends z.ZodType>(
  context: DocumentCheckContext<S>,
  direction: SelectionCursorDirection,
  options?: SelectionCursorOptions,
): CheckResult {
  return toCheckResult(resolveSelectionCursor(selectionState(context), direction, context.state, options));
}

export function checkDocumentExtendCursor<S extends z.ZodType>(
  context: DocumentCheckContext<S>,
  direction: SelectionCursorDirection,
  options?: SelectionCursorOptions,
): CheckResult {
  return toCheckResult(resolveSelectionCursor(selectionState(context), direction, context.state, options));
}

export function checkDocumentFind(jsonpath: string): CheckResult {
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

export function checkDocumentMove<S extends z.ZodType>(
  context: DocumentCheckContext<S>,
  fromOrTo: Pointer,
  maybeTo?: Pointer,
  hasToArg = arguments.length >= 3,
): CheckResult {
  const args = resolveMoveArgs(fromOrTo, maybeTo, hasToArg);
  const source = primarySourceOrSelection(context, args.from);
  return source === null
    ? emptySelection("move source selection is empty")
    : toCheckResult(moveVerb(context.schema, context.state, source, args.to, {
        previewPatch: context.previewPatch,
      }));
}

export function checkDocumentDuplicate<S extends z.ZodType>(
  context: DocumentCheckContext<S>,
  sourceOrOpts?: Pointer | DuplicateOpts,
  opts?: DuplicateOpts,
): CheckResult {
  const args = resolveDuplicateArgs(sourceOrOpts, opts);
  const source = primarySourceOrSelection(context, args.source);
  return source === null
    ? emptySelection("duplicate source selection is empty")
    : toCheckResult(duplicate(context.schema, context.state, source, args.opts, {
        previewPatch: context.previewPatch,
        trustedPayload: trustedState(context),
      }));
}

export function checkDocumentRemove<S extends z.ZodType>(
  context: DocumentCheckContext<S>,
  source?: SelectionSource,
): CheckResult {
  const resolved = sourceOrSelection(context, source);
  if (resolved === null) return emptySelection("remove source selection is empty");
  const planned = removeSourcesPatch(resolved);
  return planned.ok
    ? checkDocumentPatch(context, planned.patch)
    : toCheckResult(pointerSourceCheckError(planned, "remove"));
}

export function checkDocumentReplace<S extends z.ZodType>(
  context: DocumentCheckContext<S>,
  pathOrValue: Pointer | unknown,
  maybeValue?: unknown,
  hasValueArg = arguments.length >= 3,
): CheckResult {
  const args = resolveReplaceArgs(pathOrValue, maybeValue, hasValueArg);
  if (args.target !== undefined && isJSONPath(args.target)) {
    return toCheckResult(replaceVerb(context.schema, context.state, args.target, args.value, {
      previewPatch: context.previewPatch,
    }));
  }
  const target = targetOrSelection(context, args.target);
  return target === null
    ? emptySelection("replace target selection is empty")
    : checkDocumentPatch(context, [{ op: "replace", path: target, value: args.value }]);
}

export function checkDocumentReplaceText<S extends z.ZodType>(
  context: DocumentCheckContext<S>,
  replacement: string,
  textOptions?: SelectionTextEditOptions & HistoryTransactionOptions,
): CheckResult {
  const planned = replaceSelectionText(selectionState(context), context.state, replacement, textOptions);
  return planned.ok
    ? checkDocumentPatch(context, planned.patch)
    : toCheckResult(planned);
}

export function checkDocumentDeleteText<S extends z.ZodType>(
  context: DocumentCheckContext<S>,
  textOptions?: SelectionTextDeleteOptions & HistoryTransactionOptions,
): CheckResult {
  const planned = deleteSelectionText(selectionState(context), context.state, textOptions);
  return planned.ok
    ? checkDocumentPatch(context, planned.patch)
    : toCheckResult(planned);
}

export function checkDocumentCut<S extends z.ZodType>(
  context: DocumentCheckContext<S>,
  source?: ClipboardSource,
): CheckResult {
  const resolved = sourceOrSelection(context, source);
  return resolved === null
    ? emptySelection("cut source selection is empty")
    : toCheckResult(cut(context.schema, context.state, resolved, {
        trusted: trustedState(context),
        clonePayload: false,
        previewPatch: context.previewPatch,
      }));
}

export function checkDocumentCopy<S extends z.ZodType>(
  context: DocumentCheckContext<S>,
  source?: ClipboardSource,
): CheckResult {
  const resolved = sourceOrSelection(context, source);
  return resolved === null
    ? emptySelection("copy source selection is empty")
    : toCheckResult(copy(context.state, resolved, {
        trusted: trustedState(context),
        clonePayload: false,
      }));
}

export function checkDocumentPaste<S extends z.ZodType>(
  context: DocumentCheckContext<S>,
  payload: unknown,
  target?: PasteTarget,
  options?: PasteOptions,
  executionOptions?: CheckPasteExecutionOptions,
): CheckResult {
  return planDocumentPasteCheck({
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

export function planDocumentPasteCheck<S extends z.ZodType>(
  input: PlanDocumentPasteCheckInput<S>,
): CheckResult {
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
    : toCheckResult(paste(input.schema, input.state, input.payload, resolvedTarget, args.mode, {
        ...args.options,
        previewPatch: pastePreview,
        trustedPayload: inputTrustedPayload,
      }));
}

export function checkDocumentPatch<S extends z.ZodType>(
  context: DocumentCheckContext<S>,
  operations: ReadonlyArray<JSONPatchOperation>,
): CheckResult {
  return toCheckResult(checkPatch(context, operations));
}

function checkPatch<S extends z.ZodType>(
  context: DocumentCheckContext<S>,
  patch: ReadonlyArray<JSONPatchOperation>,
): CheckableResult {
  return context.previewPatch
    ? preFlightFromApplyResult(context.previewPatch(patch))
    : preFlight(context.schema, context.state, patch);
}

function trustedState<S extends z.ZodType>(context: DocumentCheckContext<S>): boolean {
  return context.stateJsonTrusted === true;
}

function selectionState<S extends z.ZodType>(context: DocumentCheckContext<S>): SelectionSnap {
  return context.selection ?? EMPTY_SELECTION;
}

function sourceOrSelection<S extends z.ZodType>(
  context: DocumentCheckContext<S>,
  source?: ClipboardSource,
): ClipboardSource | null {
  return source ?? selectedSource(selectionState(context));
}

function targetOrSelection<S extends z.ZodType>(
  context: DocumentCheckContext<S>,
  target?: Pointer,
): Pointer | null {
  return target ?? primaryPointer(selectionState(context));
}

function primarySourceOrSelection<S extends z.ZodType>(
  context: DocumentCheckContext<S>,
  source?: Pointer,
): Pointer | null {
  return source ?? primaryPointer(selectionState(context));
}

function toCheckResult(result: CheckableResult): CheckResult {
  if (result.ok) return OK;

  const out: Extract<CheckResult, { ok: false }> = {
    ok: false,
    code: result.code,
  };
  const reason = result.reason ?? result.message;
  if (reason !== undefined) out.reason = reason;
  if (result.pointer !== undefined && result.pointer !== null) out.pointer = result.pointer;
  if (result.violations !== undefined) out.violations = result.violations;
  return out;
}

function emptyStack(kind: "undo" | "redo"): CheckResult {
  return {
    ok: false,
    code: "empty_stack",
    reason: `${kind} stack is empty`,
  };
}

function emptySelection(reason: string): CheckResult {
  return {
    ok: false,
    code: "empty_selection",
    reason,
  };
}

function pointerSourceCheckError(error: PointerSourceError, label: string): CheckableResult {
  return error.code === "invalid_pointer"
    ? { ok: false, code: "invalid_pointer", reason: `invalid ${label} source pointer: ${error.pointer}`, pointer: error.pointer }
    : { ok: false, code: "empty_selection", reason: `${label} source selection is empty` };
}

function resolveReplaceArgs(
  pathOrValue: Pointer | unknown,
  value: unknown,
  hasValueArg: boolean,
): { target?: Pointer; value: unknown } {
  return hasValueArg
    ? { target: pathOrValue as Pointer, value }
    : { value: pathOrValue };
}

function isJSONPath(value: Pointer): boolean {
  return value.startsWith("$");
}
