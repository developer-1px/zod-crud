// verbs/move — Edit 기둥, RFC 6902 move op.
// pure composer. preFlight gate 통과 후 next + patch 산출.

import type { JsonPatchOperation } from "../core/patch/index.js";
import { preFlight } from "../core/schema/preFlight.js";
import type { Pointer } from "../core/pointer/index.js";
import type * as z from "zod";

export interface MoveResult<T> {
  ok: true;
  next: T;
  patch: JsonPatchOperation[];
}

export interface MoveError {
  ok: false;
  code: string;
  message: string;
  violations?: ReadonlyArray<{ path: string; message: string }>;
}

/**
 * RFC 6902 `move` op. (schema, state, from, to) → preFlight gate → { next, patch }.
 * preFlight 거부 시 commit 하지 않음 — history 오염 0 (P4.4).
 */
export function move<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  from: Pointer,
  to: Pointer,
): MoveResult<z.output<S>> | MoveError {
  const op: JsonPatchOperation = { op: "move", from, path: to };
  const r = preFlight(schema, state, [op]);
  if (!r.ok) {
    return { ok: false, code: r.code, message: r.message, violations: r.violations };
  }
  return { ok: true, next: r.draft, patch: [op] };
}
