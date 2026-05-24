import { jsonSerializableError } from "../json.js";
import { applyOpRaw, validateOperationShape } from "./apply.js";
import { normalizeOp } from "./internal.js";
import { applyAppendOnlyAddPatch, applyTailRemovePatch } from "./fastArrayAppendRemove.js";
import { applySameArrayElementReplacePatch } from "./fastArrayElementReplace.js";
import { applySameArrayFieldReplacePatch } from "./fastArrayFieldReplace.js";
import { applySameArrayNestedReplacePatch } from "./fastArrayNestedReplace.js";
import { applySameArrayStructuralPatch } from "./fastArrayStructural.js";
import { applyIndependentReplacePatch } from "./fastIndependentReplace.js";
import {
  applyRootObjectAddPatch,
  applyRootObjectRemovePatch,
  applyRootObjectReplacePatch,
} from "./fastRootObject.js";
import { fail, ok } from "./result.js";
import { applyTrustedValueMutation } from "./trustedValueMutation.js";
import type {
  JSONPatchOperation,
  TrustedApplyResult,
  TrustedPatchOptions,
} from "./types.js";

export function applyTrustedPatch<T>(
  state: T,
  ops: ReadonlyArray<JSONPatchOperation>,
  options: TrustedPatchOptions = {},
): TrustedApplyResult<T> {
  if (!Array.isArray(ops)) return { state, result: fail("invalid_pointer", "patch must be an array"), applied: [] };
  const valuesTrusted = options.valuesTrusted === true;
  const singleValueFast = applySingleTrustedValuePatch(state, ops, valuesTrusted);
  if (singleValueFast !== null) return singleValueFast as TrustedApplyResult<T>;

  const fast = applyTrustedFastPatch(state, ops, valuesTrusted);
  if (fast !== null) return { state: fast.state as T, result: ok, applied: fast.applied };

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
  return { state: cur as T, result: ok, applied: normalized };
}

export function applyAcceptedPatch<T>(
  state: T,
  ops: ReadonlyArray<JSONPatchOperation>,
): TrustedApplyResult<T> {
  if (!Array.isArray(ops)) return { state, result: fail("invalid_pointer", "patch must be an array"), applied: [] };

  if (ops.length === 1 && 0 in ops) {
    const single = applyAcceptedSingleTrustedValuePatch(state, ops[0]!);
    if (single !== null) return single as TrustedApplyResult<T>;
  }

  let candidate = applyRootObjectRemovePatch(state, ops);
  if (candidate.handled) return { state: candidate.state as T, result: ok, applied: candidate.applied };
  candidate = applyRootObjectAddPatch(state, ops, true);
  if (candidate.handled) return { state: candidate.state as T, result: ok, applied: candidate.applied };
  candidate = applyRootObjectReplacePatch(state, ops, true);
  if (candidate.handled) return { state: candidate.state as T, result: ok, applied: candidate.applied };
  candidate = applySameArrayFieldReplacePatch(state, ops, true);
  if (candidate.handled) return { state: candidate.state as T, result: ok, applied: candidate.applied };
  candidate = applySameArrayNestedReplacePatch(state, ops, true);
  if (candidate.handled) return { state: candidate.state as T, result: ok, applied: candidate.applied };
  candidate = applySameArrayElementReplacePatch(state, ops, true);
  if (candidate.handled) return { state: candidate.state as T, result: ok, applied: candidate.applied };

  return applyTrustedPatch(state, ops, { valuesTrusted: true });
}

function applySingleTrustedValuePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): TrustedApplyResult<unknown> | null {
  if (ops.length !== 1 || !(0 in ops)) return null;
  const op = ops[0]!;
  if (op === null || typeof op !== "object" || (op.op !== "add" && op.op !== "replace") || typeof op.path !== "string" || !("value" in op)) {
    return null;
  }

  const shape = validateOperationShape(op);
  if (shape) return { state, result: fail(shape.error, `op[0]: ${shape.reason}`), applied: [] };
  if (!valuesTrusted && jsonSerializableError(op.value) !== null) return null;

  const normalized = op.op === "add" && op.path.endsWith("/-") ? normalizeOp(op, state) : op;
  if (normalized.op !== "add" && normalized.op !== "replace") return null;

  const applied = applyTrustedValueMutation(state, normalized);
  if ("error" in applied) {
    return { state, result: fail(applied.error, applied.reason ? `op[0]: ${applied.reason}` : "op[0]", applied.pointer), applied: [] };
  }

  return { state: applied.state, result: ok, applied: [normalized] };
}

function applyAcceptedSingleTrustedValuePatch(
  state: unknown,
  op: JSONPatchOperation,
): TrustedApplyResult<unknown> | null {
  if (op === null || typeof op !== "object" || (op.op !== "add" && op.op !== "replace") || typeof op.path !== "string" || !("value" in op)) {
    return null;
  }
  const normalized = op.op === "add" && op.path.endsWith("/-") ? normalizeOp(op, state) : op;
  if (normalized.op !== "add" && normalized.op !== "replace") return null;
  const applied = applyTrustedValueMutation(state, normalized);
  if ("error" in applied) {
    return { state, result: fail(applied.error, applied.reason ? `op[0]: ${applied.reason}` : "op[0]", applied.pointer), applied: [] };
  }
  return { state: applied.state, result: ok, applied: [normalized] };
}

function applyTrustedFastPatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): { state: unknown; applied: ReadonlyArray<JSONPatchOperation> } | null {
  let candidate = applyAppendOnlyAddPatch(state, ops, valuesTrusted);
  if (candidate.handled) return { state: candidate.state, applied: candidate.applied };
  candidate = applyTailRemovePatch(state, ops);
  if (candidate.handled) return { state: candidate.state, applied: candidate.applied };
  candidate = applyRootObjectRemovePatch(state, ops);
  if (candidate.handled) return { state: candidate.state, applied: candidate.applied };
  candidate = applyRootObjectAddPatch(state, ops, valuesTrusted);
  if (candidate.handled) return { state: candidate.state, applied: candidate.applied };
  candidate = applySameArrayFieldReplacePatch(state, ops, valuesTrusted);
  if (candidate.handled) return { state: candidate.state, applied: candidate.applied };
  candidate = applySameArrayNestedReplacePatch(state, ops, valuesTrusted);
  if (candidate.handled) return { state: candidate.state, applied: candidate.applied };
  if (valuesTrusted) {
    candidate = applyRootObjectReplacePatch(state, ops, true);
    if (candidate.handled) return { state: candidate.state, applied: candidate.applied };
  }
  candidate = applySameArrayElementReplacePatch(state, ops, valuesTrusted);
  if (candidate.handled) return { state: candidate.state, applied: candidate.applied };
  candidate = applyIndependentReplacePatch(state, ops, valuesTrusted);
  if (candidate.handled) return { state: candidate.state, applied: candidate.applied };
  candidate = applySameArrayStructuralPatch(state, ops, valuesTrusted);
  if (candidate.handled) return { state: candidate.state, applied: candidate.applied };
  return null;
}
