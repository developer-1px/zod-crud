import type * as z from "zod";

import type { JSONPatchOperation, ErrorCode } from "./core/patch/index.js";
import type { Pointer } from "./core/pointer/index.js";
import { preFlight, type PreFlightErrorCode } from "./core/schema/preFlight.js";
import type { JSONDocumentOps } from "./jsonOps.js";
import { copy, type ClipboardSource } from "./verbs/copy.js";
import { cut } from "./verbs/cut.js";
import { duplicate, type DuplicateOpts } from "./verbs/duplicate.js";
import { move as moveVerb } from "./verbs/move.js";
import { paste, type PasteMode, type PasteOptions } from "./verbs/paste.js";

export type CheckErrorCode =
  | ErrorCode
  | PreFlightErrorCode
  | "du_branch_mismatch"
  | "rekey_failed"
  | "missing_new_key"
  | "key_conflict"
  | "empty_selection"
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
  move(from: Pointer, to: Pointer): CheckResult;
  duplicate(source: Pointer, opts?: DuplicateOpts): CheckResult;
  replace(path: Pointer, value: unknown): CheckResult;
  cut(source: ClipboardSource): CheckResult;
  copy(source: ClipboardSource): CheckResult;
  paste(payload: unknown, target: Pointer, mode?: PasteMode, options?: PasteOptions): CheckResult;
  patch(ops: ReadonlyArray<JSONPatchOperation>): CheckResult;

  readonly undo: CheckResult;
  readonly redo: CheckResult;
}

export interface BuildCheckArgs<S extends z.ZodType> {
  schema: S;
  ops: JSONDocumentOps<z.output<S>>;
}

type CheckableResult =
  | { ok: true }
  | {
      ok: false;
      code: CheckErrorCode;
      message?: string;
      reason?: string;
      pointer?: Pointer;
      violations?: ReadonlyArray<CheckViolation>;
    };

const OK: CheckResult = { ok: true };

export function buildCheck<S extends z.ZodType>(
  args: BuildCheckArgs<S>,
): Check<z.output<S>> {
  const { schema, ops } = args;

  return {
    move(from, to) {
      return toCheckResult(moveVerb(schema, ops.state, from, to));
    },
    duplicate(source, opts) {
      return toCheckResult(duplicate(schema, ops.state, source, opts));
    },
    replace(path, value) {
      return toCheckResult(preFlight(schema, ops.state, [{ op: "replace", path, value }]));
    },
    cut(source) {
      return toCheckResult(cut(schema, ops.state, source));
    },
    copy(source) {
      return toCheckResult(copy(ops.state, source));
    },
    paste(payload, target, mode = "into", options = {}) {
      return toCheckResult(paste(schema, ops.state, payload, target, mode, options));
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

function toCheckResult(result: CheckableResult): CheckResult {
  if (result.ok) return OK;

  const out: Extract<CheckResult, { ok: false }> = {
    ok: false,
    code: result.code,
  };
  const reason = result.reason ?? result.message;
  if (reason !== undefined) out.reason = reason;
  if (result.pointer !== undefined) out.pointer = result.pointer;
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
