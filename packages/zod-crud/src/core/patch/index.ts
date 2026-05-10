// RFC 6902 — JSON Patch. SPEC.md §3.
// 공개 표면: 타입 + applyOperation + applyPatch + computeInverses.
// 구현 디테일: ./patch-internal · ./patch-apply · ./patch-inverse.

import type * as z from "zod";
import type { Pointer } from "../pointer/index.js";
import { applyOpRaw } from "./apply.js";

export { computeInverses } from "./inverse.js";

export type JsonPatchOperation =
  | { op: "add";     path: Pointer; value: unknown }
  | { op: "remove";  path: Pointer }
  | { op: "replace"; path: Pointer; value: unknown }
  | { op: "move";    from: Pointer; path: Pointer }
  | { op: "copy";    from: Pointer; path: Pointer }
  | { op: "test";    path: Pointer; value: unknown };

export type ErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "move_into_self"
  | "schema_violation"
  | "test_failed"
  | "not_serializable";

export type JsonResult =
  | { ok: true }
  | { ok: false; code: ErrorCode; reason?: string; pointer?: Pointer };

export interface ApplyResult<S extends z.ZodType> {
  state: z.output<S>;
  result: JsonResult;
  applied: ReadonlyArray<JsonPatchOperation>;
}

const ok: JsonResult = { ok: true };
const fail = (code: ErrorCode, reason?: string, pointer?: Pointer): JsonResult => {
  const r: { ok: false; code: ErrorCode; reason?: string; pointer?: Pointer } = { ok: false, code };
  if (reason !== undefined) r.reason = reason;
  if (pointer !== undefined) r.pointer = pointer;
  return r;
};

// 단일 op + schema 검증.
export function applyOperation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  op: JsonPatchOperation,
): ApplyResult<S> {
  const r = applyOpRaw(state, op);
  if ("error" in r) return { state, result: fail(r.error, r.reason, r.pointer), applied: [] };
  if (op.op === "test") return { state, result: ok, applied: [op] };
  const parsed = schema.safeParse(r.state);
  if (!parsed.success) return { state, result: fail("schema_violation", parsed.error.message), applied: [] };
  return { state: parsed.data as z.output<S>, result: ok, applied: [op] };
}

// Batch (RFC 6902 §3): atomic — 한 op 실패 시 전체 롤백. Schema 검증은 끝에서 1회.
export function applyPatch<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JsonPatchOperation>,
): ApplyResult<S> {
  let cur: unknown = state;
  for (let i = 0; i < ops.length; i++) {
    const r = applyOpRaw(cur, ops[i]!);
    if ("error" in r) {
      return {
        state,
        result: fail(r.error, r.reason ? `op[${i}]: ${r.reason}` : `op[${i}]`, r.pointer),
        applied: [],
      };
    }
    cur = r.state;
  }
  const parsed = schema.safeParse(cur);
  if (!parsed.success) return { state, result: fail("schema_violation", parsed.error.message), applied: [] };
  return { state: parsed.data as z.output<S>, result: ok, applied: ops };
}
