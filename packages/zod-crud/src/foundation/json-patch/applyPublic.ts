import type * as z from "zod";
import { jsonSerializableError } from "../json.js";
import { applyOpRaw, validateOperationShape } from "./apply.js";
import { normalizeOp } from "./internal.js";
import { applyPublicTrustedStateFastPatch } from "./fastStrategies.js";
import { fail, ok, zodIssuesReason } from "./result.js";
import { applyTrustedValueMutation } from "./trustedValueMutation.js";
import type { ApplyResult, JSONPatchOperation } from "./types.js";

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
  const parsed = schema.safeParse(r.state);
  if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
  return { state: r.state as z.output<S>, result: ok, applied: [normalized] };
}

export function applyPatch<S extends z.ZodTypeAny>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> {
  const stateJsonErr = jsonSerializableError(state);
  if (stateJsonErr) return { state, result: fail("not_serializable", stateJsonErr), applied: [] };
  return applyPatchToTrustedState(schema, state, ops);
}

export function applyPatchToTrustedState<S extends z.ZodTypeAny>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> {
  if (!Array.isArray(ops)) return { state, result: fail("invalid_pointer", "patch must be an array"), applied: [] };
  const fast = applyPublicTrustedStateFastPatch(state, ops);
  if (fast !== null) {
    const parsed = schema.safeParse(fast.state);
    if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
    return { state: fast.state as z.output<S>, result: ok, applied: fast.applied };
  }

  let cur: unknown = state;
  const normalized: JSONPatchOperation[] = [];
  for (let i = 0; i < ops.length; i++) {
    if (!(i in ops)) return { state, result: fail("invalid_pointer", `op[${i}]: op must be object`), applied: [] };
    const shape = validateOperationShape(ops[i]!);
    if (shape) return { state, result: fail(shape.error, `op[${i}]: ${shape.reason}`), applied: [] };
    const n = normalizeOp(ops[i]!, cur);
    normalized.push(n);
    const r = applyOpRaw(cur, n);
    if ("error" in r) {
      return { state, result: fail(r.error, r.reason ? `op[${i}]: ${r.reason}` : `op[${i}]`, r.pointer), applied: [] };
    }
    cur = r.state;
  }
  const parsed = schema.safeParse(cur);
  if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
  return { state: cur as z.output<S>, result: ok, applied: normalized };
}

export function applySingleTrustedValuePatchToTrustedState<S extends z.ZodTypeAny>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> | null {
  if (!Array.isArray(ops) || ops.length !== 1 || !(0 in ops)) return null;

  const op = ops[0]!;
  if (op === null || typeof op !== "object") return null;
  if (op.op !== "add" && op.op !== "replace") return null;

  const shape = validateOperationShape(op);
  if (shape) return { state, result: fail(shape.error, `op[0]: ${shape.reason}`), applied: [] };

  const normalized = normalizeOp(op, state);
  if (normalized.op !== "add" && normalized.op !== "replace") return null;

  const applied = applyTrustedValueMutation(state, normalized);
  if ("error" in applied) {
    return { state, result: fail(applied.error, applied.reason ? `op[0]: ${applied.reason}` : "op[0]", applied.pointer), applied: [] };
  }

  const parsed = schema.safeParse(applied.state);
  if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
  return { state: applied.state as z.output<S>, result: ok, applied: [normalized] };
}
