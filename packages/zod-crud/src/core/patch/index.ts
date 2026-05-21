// RFC 6902 — JSON Patch. SPEC.md §3.
// Root public surface: types + applyOperation + applyPatch.
// computeInverses stays source-internal for document history.

import type * as z from "zod";
import { jsonSerializableError } from "../json.js";
import type { Pointer } from "../pointer/index.js";
import { applyOpRaw, validateOperationShape } from "./apply.js";
import { normalizeOp } from "./internal.js";

export type JSONPatchOperation =
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

export type JSONResult =
  | { ok: true }
  | { ok: false; code: ErrorCode; reason?: string; pointer?: Pointer };

export interface ApplyResult<S extends z.ZodTypeAny> {
  state: z.output<S>;
  result: JSONResult;
  applied: ReadonlyArray<JSONPatchOperation>;
}

const ok: JSONResult = { ok: true };
const fail = (code: ErrorCode, reason?: string, pointer?: Pointer): JSONResult => {
  const r: { ok: false; code: ErrorCode; reason?: string; pointer?: Pointer } = { ok: false, code };
  if (reason !== undefined) r.reason = reason;
  if (pointer !== undefined) r.pointer = pointer;
  return r;
};
const zodIssuesReason = (error: z.ZodError): string => JSON.stringify(error.issues);

// 단일 op + schema 검증. applied 는 `/-` 가 적용 시점의 concrete index 로 정규화된 op.
export function applyOperation<S extends z.ZodTypeAny>(
  schema: S,
  state: z.output<S>,
  op: JSONPatchOperation,
): ApplyResult<S> {
  const stateJsonErr = jsonSerializableError(state);
  if (stateJsonErr) return { state, result: fail("not_serializable", stateJsonErr), applied: [] };
  const shape = validateOperationShape(op);
  if (shape) return { state, result: fail(shape.error, shape.reason), applied: [] };
  const normalized = normalizeOp(op, state);
  const r = applyOpRaw(state, normalized);
  if ("error" in r) return { state, result: fail(r.error, r.reason, r.pointer), applied: [] };
  if (normalized.op === "test") return { state, result: ok, applied: [normalized] };
  const jsonErr = jsonSerializableError(r.state);
  if (jsonErr) return { state, result: fail("not_serializable", jsonErr), applied: [] };
  const parsed = schema.safeParse(r.state);
  if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
  // #57 structural sharing: withMutated 이미 touched path 만 spread. parsed.data 대신 r.state 반환.
  return { state: r.state as z.output<S>, result: ok, applied: [normalized] };
}

// Batch (RFC 6902 §3): atomic — 한 op 실패 시 전체 롤백. Schema 검증은 끝에서 1회.
// applied 는 적용 시점 기준으로 `/-` 가 concrete index 로 정규화된 ops 의 누적.
export function applyPatch<S extends z.ZodTypeAny>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> {
  const stateJsonErr = jsonSerializableError(state);
  if (stateJsonErr) return { state, result: fail("not_serializable", stateJsonErr), applied: [] };
  if (!Array.isArray(ops)) {
    return { state, result: fail("invalid_pointer", "patch must be an array"), applied: [] };
  }
  let cur: unknown = state;
  const normalized: JSONPatchOperation[] = [];
  for (let i = 0; i < ops.length; i++) {
    if (!(i in ops)) {
      return { state, result: fail("invalid_pointer", `op[${i}]: op must be object`), applied: [] };
    }
    const shape = validateOperationShape(ops[i]!);
    if (shape) {
      return {
        state,
        result: fail(shape.error, `op[${i}]: ${shape.reason}`),
        applied: [],
      };
    }
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
  const jsonErr = jsonSerializableError(cur);
  if (jsonErr) return { state, result: fail("not_serializable", jsonErr), applied: [] };
  const parsed = schema.safeParse(cur);
  if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
  // #57 structural sharing: withMutated 이미 touched path 만 spread. parsed.data 대신 cur 반환.
  return { state: cur as z.output<S>, result: ok, applied: normalized };
}
