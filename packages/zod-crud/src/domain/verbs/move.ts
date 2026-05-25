// verbs/move — Edit 기둥, RFC 6902 move op.
// pure composer. patchPreflight gate 통과 후 next + patch 산출.

import type { ApplyResult, JSONPatchOperation } from "../../foundation/json-patch/types.js";
import { patchPreflight, patchPreflightFromApplyResult, type PatchPreflightErrorCode } from "../schema/patchPreflight.js";
import type { Pointer } from "../../foundation/json-pointer/pointerCore.js";
import type * as z from "zod";

interface MoveOk<T> {
  ok: true;
  next: T;
  patch: JSONPatchOperation[];
}

interface MoveError {
  ok: false;
  code: "empty_selection" | PatchPreflightErrorCode;
  message: string;
  violations?: ReadonlyArray<{ path: string; message: string }>;
}

type MoveResult<T> = MoveOk<T> | MoveError;

interface ResolvedMoveArgs {
  from?: Pointer;
  to: Pointer;
}

interface MoveOptions {
  previewPatch?: ((operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<z.ZodTypeAny>) | undefined;
}

export function resolveMoveArgs(
  fromOrTo: Pointer,
  to: Pointer | undefined,
  hasToArg: boolean,
): ResolvedMoveArgs {
  return hasToArg ? { from: fromOrTo, to: to! } : { to: fromOrTo };
}

/**
 * RFC 6902 `move` op. (schema, state, from, to) → patchPreflight gate → { next, patch }.
 * patchPreflight 거부 시 commit 하지 않음 — history 오염 0 (P4.4).
 */
export function move<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  from: Pointer,
  to: Pointer,
  options: MoveOptions = {},
): MoveResult<z.output<S>> {
  const op: JSONPatchOperation = { op: "move", from, path: to };
  const r = options.previewPatch
    ? patchPreflightFromApplyResult(options.previewPatch([op]))
    : patchPreflight(schema, state, [op]);
  if (!r.ok) {
    return { ok: false, code: r.code, message: r.message, violations: r.violations };
  }
  return { ok: true, next: r.draft as z.output<S>, patch: [op] };
}
