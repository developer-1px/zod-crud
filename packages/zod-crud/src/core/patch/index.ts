// RFC 6902 — JSON Patch. SPEC.md §3.
// 공개 표면: 타입 + applyOperation + applyPatch + computeInverses.
// 구현 디테일: ./patch-internal · ./patch-apply · ./patch-inverse.

import type * as z from "zod";
import type { Pointer } from "../pointer/index.js";
import { applyOpRaw } from "./apply.js";
import { normalizeOp } from "./internal.js";

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

export interface ApplyResult<S extends z.ZodTypeAny> {
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

// 단일 op + schema 검증. applied 는 `/-` 가 적용 시점의 concrete index 로 정규화된 op.
export function applyOperation<S extends z.ZodTypeAny>(
  schema: S,
  state: z.output<S>,
  op: JsonPatchOperation,
): ApplyResult<S> {
  const normalized = normalizeOp(op, state);
  const r = applyOpRaw(state, normalized);
  if ("error" in r) return { state, result: fail(r.error, r.reason, r.pointer), applied: [] };
  if (normalized.op === "test") return { state, result: ok, applied: [normalized] };
  const parsed = schema.safeParse(r.state);
  if (!parsed.success) return { state, result: fail("schema_violation", parsed.error.message), applied: [] };
  return { state: parsed.data as z.output<S>, result: ok, applied: [normalized] };
}

// Batch (RFC 6902 §3): atomic — 한 op 실패 시 전체 롤백. Schema 검증은 끝에서 1회.
// applied 는 적용 시점 기준으로 `/-` 가 concrete index 로 정규화된 ops 의 누적.
export function applyPatch<S extends z.ZodTypeAny>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JsonPatchOperation>,
): ApplyResult<S> {
  let cur: unknown = state;
  const normalized: JsonPatchOperation[] = [];
  for (let i = 0; i < ops.length; i++) {
    const n = normalizeOp(ops[i]!, cur);
    normalized.push(n);
    const r = applyOpRaw(cur, n);
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
  return { state: parsed.data as z.output<S>, result: ok, applied: normalized };
}
