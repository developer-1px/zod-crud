import type * as z from "zod";

import type { JSONPatchOperation, ErrorCode } from "./core/patch/index.js";
import type { Pointer } from "./core/pointer/index.js";
import { preFlight, type PreFlightErrorCode } from "./core/schema/preFlight.js";
import type { HistoryTransactionOptions, JSONDocumentOps } from "./jsonOps.js";
import { copy, type ClipboardSource } from "./verbs/copy.js";
import { cut } from "./verbs/cut.js";
import { duplicate, resolveDuplicateArgs, type DuplicateOpts } from "./verbs/duplicate.js";
import { find } from "./verbs/find.js";
import { move as moveVerb, resolveMoveArgs } from "./verbs/move.js";
import { paste, resolvePasteArgs, type PasteMode, type PasteOptions } from "./verbs/paste.js";
import { replace as replaceVerb } from "./verbs/replace.js";
import {
  deleteSelectionText,
  replaceSelectionText,
  type SelectionTextDeleteOptions,
  type SelectionTextEditErrorCode,
  type SelectionTextEditOptions,
} from "./core/selection/textEdit.js";
import {
  EMPTY_SELECTION,
  primaryPointer,
  resolveSelectionCursor,
  resolveSelectionScope,
  selectedSource,
  type SelectionCursorDirection,
  type SelectionCursorOptions,
  type SelectionScopeOptions,
  type SelectionSnap,
} from "./core/selection/index.js";

export type CheckErrorCode =
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
  | "apply_failed";

export interface CheckViolation {
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

export interface Check<T> {
  selectScope(options?: SelectionScopeOptions): CheckResult;
  moveCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): CheckResult;
  extendCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): CheckResult;
  find(jsonpath: string): CheckResult;
  move(fromOrTo: Pointer, to?: Pointer): CheckResult;
  duplicate(sourceOrOpts?: Pointer | DuplicateOpts, opts?: DuplicateOpts): CheckResult;
  replace(pathOrValue: Pointer | unknown, value?: unknown): CheckResult;
  replaceText(replacement: string, options?: SelectionTextEditOptions & HistoryTransactionOptions): CheckResult;
  deleteText(options?: SelectionTextDeleteOptions & HistoryTransactionOptions): CheckResult;
  cut(source?: ClipboardSource): CheckResult;
  copy(source?: ClipboardSource): CheckResult;
  paste(
    payload: unknown,
    targetOrMode?: Pointer | PasteMode,
    modeOrOptions?: PasteMode | PasteOptions,
    options?: PasteOptions,
  ): CheckResult;
  patch(ops: ReadonlyArray<JSONPatchOperation>): CheckResult;

  readonly undo: CheckResult;
  readonly redo: CheckResult;
}

export interface BuildCheckArgs<S extends z.ZodType> {
  schema: S;
  ops: JSONDocumentOps<z.output<S>>;
  selectionRef?: { current: SelectionSnap };
}

export type CreateCheckOptions<S extends z.ZodType> = BuildCheckArgs<S>;

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
  args: CreateCheckOptions<S>,
): Check<z.output<S>> {
  const { schema, ops, selectionRef } = args;
  const sourceOrSelection = (source?: ClipboardSource): ClipboardSource | null =>
    source ?? (selectionRef ? selectedSource(selectionRef.current) : null);
  const targetOrSelection = (target?: Pointer): Pointer | null =>
    target ?? (selectionRef ? primaryPointer(selectionRef.current) : null);
  const primarySourceOrSelection = (source?: Pointer): Pointer | null =>
    source ?? (selectionRef ? primaryPointer(selectionRef.current) : null);
  const selectionState = (): SelectionSnap => selectionRef?.current ?? EMPTY_SELECTION;

  return {
    selectScope(options) {
      return toCheckResult(resolveSelectionScope(ops.state, options));
    },
    moveCursor(direction, options) {
      return toCheckResult(resolveSelectionCursor(selectionState(), direction, ops.state, options));
    },
    extendCursor(direction, options) {
      return toCheckResult(resolveSelectionCursor(selectionState(), direction, ops.state, options));
    },
    find(jsonpath) {
      return toCheckResult(find(ops.state, jsonpath));
    },
    move(fromOrTo, maybeTo) {
      const args = resolveMoveArgs(fromOrTo, maybeTo, arguments.length >= 2);
      const source = primarySourceOrSelection(args.from);
      return source === null
        ? emptySelection("move source selection is empty")
        : toCheckResult(moveVerb(schema, ops.state, source, args.to));
    },
    duplicate(sourceOrOpts, opts) {
      const args = resolveDuplicateArgs(sourceOrOpts, opts);
      const source = primarySourceOrSelection(args.source);
      return source === null
        ? emptySelection("duplicate source selection is empty")
        : toCheckResult(duplicate(schema, ops.state, source, args.opts));
    },
    replace(pathOrValue, maybeValue) {
      const args = resolveReplaceArgs(pathOrValue, maybeValue, arguments.length >= 2);
      if (args.target !== undefined && isJSONPath(args.target)) {
        return toCheckResult(replaceVerb(schema, ops.state, args.target, args.value));
      }
      const target = targetOrSelection(args.target);
      return target === null
        ? emptySelection("replace target selection is empty")
        : toCheckResult(preFlight(schema, ops.state, [{ op: "replace", path: target, value: args.value }]));
    },
    replaceText(replacement, textOptions) {
      const planned = replaceSelectionText(selectionState(), ops.state, replacement, textOptions);
      return planned.ok
        ? toCheckResult(preFlight(schema, ops.state, planned.patch))
        : toCheckResult(planned);
    },
    deleteText(textOptions) {
      const planned = deleteSelectionText(selectionState(), ops.state, textOptions);
      return planned.ok
        ? toCheckResult(preFlight(schema, ops.state, planned.patch))
        : toCheckResult(planned);
    },
    cut(source) {
      const resolved = sourceOrSelection(source);
      return resolved === null ? emptySelection("cut source selection is empty") : toCheckResult(cut(schema, ops.state, resolved));
    },
    copy(source) {
      const resolved = sourceOrSelection(source);
      return resolved === null ? emptySelection("copy source selection is empty") : toCheckResult(copy(ops.state, resolved));
    },
    paste(payload, targetOrMode, modeOrOptions, maybeOptions) {
      const args = resolvePasteArgs(targetOrMode, modeOrOptions, maybeOptions);
      const target = targetOrSelection(args.target);
      return target === null
        ? emptySelection("paste target selection is empty")
        : toCheckResult(paste(schema, ops.state, payload, target, args.mode, args.options));
    },
    patch(operations) {
      return toCheckResult(preFlight(schema, ops.state, operations));
    },

    get undo() {
      return ops.canUndo() ? OK : emptyStack("undo");
    },
    get redo() {
      return ops.canRedo() ? OK : emptyStack("redo");
    },
  };
}

export const createCheck = buildCheck;

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
