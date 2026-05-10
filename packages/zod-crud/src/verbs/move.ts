// verbs/move — Edit 기둥, RFC 6902 move op.
// pure composer. core/patch.applyOperation wrapping.

import { applyOperation, type JsonPatchOperation } from "../core/patch/index.js";
import type { Pointer } from "../core/pointer/index.js";
import type * as z from "zod";

export interface MoveResult<T> {
  next: T;
  patch: JsonPatchOperation[];
  ok: true;
}

export interface MoveError {
  ok: false;
  code: string;
  message: string;
}

/**
 * RFC 6902 `move` op 적용. (state, schema, from, to) → { next, patch }.
 * pure. preFlight 가 schema 검증 (P4 진입 후 자동 결합).
 */
export function move<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  from: Pointer,
  to: Pointer,
): MoveResult<z.output<S>> | MoveError {
  const op: JsonPatchOperation = { op: "move", from, path: to };
  const r = applyOperation(schema, state, op);
  if (!r.result.ok) {
    return { ok: false, code: r.result.code, message: r.result.message ?? "" };
  }
  return { ok: true, next: r.state, patch: [op] };
}
