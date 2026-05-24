import type * as z from "zod";
import type { ApplyResult, JSONPatchOperation } from "../../foundation/json-patch/index.js";
import { applyAcceptedPatch, applyTrustedPatch } from "../../foundation/json-patch/index.js";
import { validateOperationShape } from "../../foundation/json-patch/apply.js";
import {
  arrayElementSchemaAtPath,
  cachedSchemaAtPointer,
} from "./localSchemaInfo.js";
import {
  readAppliedLocalOpSourceValue,
  type AppliedLocalOpSourceValue,
} from "./localSchemaPath.js";
import {
  failedLocalSchemaValidation,
  okLocalSchemaValidation,
  schemaViolation,
} from "./localSchemaResult.js";

export type SequentialPatchOperationPlan = Exclude<JSONPatchOperation, { op: "test" }>;

export type AppliedLocalOpValidationPlan =
  | { kind: "parse"; path: string; schema: z.ZodType; value: unknown }
  | { kind: "presence" };

export function applySequentialPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): ApplyResult<S> | null {
  const plan = planSequentialPatch(ops);
  if (plan === null) return null;
  const applied = applySequentialLocalOperations(schema, state, plan.operations, valuesTrusted);
  return applied.ok ? okLocalSchemaValidation(applied.state as z.output<S>, applied.applied) : applied.result;
}

export function applySequentialLocalOperations<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  operations: ReadonlyArray<SequentialPatchOperationPlan>,
  valuesTrusted: boolean,
): { ok: true; state: unknown; applied: JSONPatchOperation[] } | { ok: false; result: ApplyResult<S> | null } {
  let cur: unknown = state;
  const appliedOps: JSONPatchOperation[] = [];
  for (const op of operations) {
    const applied = applySequentialLocalOperation(schema, state, cur, op, valuesTrusted);
    if (!applied.ok) return { ok: false, result: applied.result };
    cur = applied.state;
    appliedOps.push(applied.applied);
  }
  return { ok: true, state: cur, applied: appliedOps };
}

export function applySequentialLocalOperation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  current: unknown,
  operation: SequentialPatchOperationPlan,
  valuesTrusted: boolean,
): { ok: true; state: unknown; applied: JSONPatchOperation } | { ok: false; result: ApplyResult<S> | null } {
  const sourceValue = readAppliedLocalOpSourceValue(current, operation);
  const applied = applySequentialLocalOperationPatch(current, operation, valuesTrusted);
  if (!applied.result.ok) return { ok: false, result: failedLocalSchemaValidation(state, applied.result) };
  const appliedOp = applied.applied[0];
  if (!appliedOp) return { ok: false, result: null };
  const validation = validateAppliedLocalOp(schema, state, appliedOp, sourceValue);
  if (validation === null || !validation.result.ok) return { ok: false, result: validation };
  return { ok: true, state: applied.state, applied: appliedOp };
}

export function applySequentialLocalOperationPatch(
  current: unknown,
  operation: SequentialPatchOperationPlan,
  valuesTrusted: boolean,
): { state: unknown; result: ApplyResult<z.ZodTypeAny>["result"]; applied: ReadonlyArray<JSONPatchOperation> } {
  const applied = valuesTrusted ? applyAcceptedPatch(current, [operation]) : applyTrustedPatch(current, [operation]);
  return applied.result.ok
    ? { state: applied.state, result: applied.result, applied: applied.applied }
    : { state: current, result: applied.result, applied: [] };
}

export function planSequentialPatch(ops: ReadonlyArray<JSONPatchOperation>): { operations: SequentialPatchOperationPlan[] } | null {
  if (!Array.isArray(ops) || ops.length === 0) return null;
  const operations = new Array<SequentialPatchOperationPlan>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (!isSequentialPatchOperationCandidate(op)) return null;
    operations[index] = op;
  }
  return { operations };
}

export function validateAppliedLocalOp<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  appliedOp: JSONPatchOperation,
  sourceValue: AppliedLocalOpSourceValue,
): ApplyResult<S> | null {
  const plan = planAppliedLocalOpValidation(schema, appliedOp, sourceValue);
  if (plan === null) return null;
  return evaluateAppliedLocalOpValidationPlan(state, appliedOp, plan);
}

export function evaluateAppliedLocalOpValidationPlan<S extends z.ZodType>(
  state: z.output<S>,
  appliedOp: JSONPatchOperation,
  plan: AppliedLocalOpValidationPlan,
): ApplyResult<S> {
  if (plan.kind === "presence") return okLocalSchemaValidation(state, [appliedOp]);
  const parsed = plan.schema.safeParse(plan.value);
  return parsed.success ? okLocalSchemaValidation(state, [appliedOp]) : schemaViolation(state, plan.path, parsed.error.issues);
}

export function planAppliedLocalOpValidation(
  schema: z.ZodType,
  operation: JSONPatchOperation,
  sourceValue: AppliedLocalOpSourceValue,
): AppliedLocalOpValidationPlan | null {
  switch (operation.op) {
    case "replace": {
      if (operation.path === "") return null;
      const valueSchema = cachedSchemaAtPointer(schema, operation.path, "value");
      return valueSchema === null ? null : { kind: "parse", path: operation.path, schema: valueSchema, value: operation.value };
    }
    case "add": {
      const element = arrayElementSchemaAtPath(schema, operation.path);
      return element === null ? null : { kind: "parse", path: operation.path, schema: element, value: operation.value };
    }
    case "remove":
      return arrayElementSchemaAtPath(schema, operation.path) === null ? null : { kind: "presence" };
    case "copy": {
      const element = arrayElementSchemaAtPath(schema, operation.path);
      return element === null || !sourceValue.ok ? null : { kind: "parse", path: operation.path, schema: element, value: sourceValue.value };
    }
    case "move": {
      const element = arrayElementSchemaAtPath(schema, operation.path);
      return element === null || !sourceValue.ok || !arrayElementSchemaAtPath(schema, operation.from)
        ? null
        : { kind: "parse", path: operation.path, schema: element, value: sourceValue.value };
    }
    default:
      return null;
  }
}

function isSequentialPatchOperationCandidate(op: JSONPatchOperation): op is SequentialPatchOperationPlan {
  return !!op
    && typeof op === "object"
    && validateOperationShape(op) === null
    && (op.op === "replace" || op.op === "add" || op.op === "remove" || op.op === "copy" || op.op === "move")
    && typeof op.path === "string";
}
