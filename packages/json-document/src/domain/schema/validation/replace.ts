import type * as z from "zod";
import type { ApplyResult, JSONPatchOperation } from "../../../foundation/patch/contract.js";
import { applyAcceptedPatch, applyTrustedPatch } from "../../../foundation/patch/trusted.js";
import { validateOperationShape } from "../../../foundation/patch/apply.js";
import { cachedSchemaAtPointer } from "../shared/schema.js";
import { acceptsKnownJsonValue } from "../shared/knownJson.js";
import {
  haveIndependentReplacePaths,
  planIndependentReplacePaths as planIndependentReplacePathsRaw,
} from "../array/path.js";
import { failedLocalSchemaValidation, okLocalSchemaValidation } from "../shared/result.js";
import {
  applySingleArrayFieldReplace,
  applyKnownJsonSameArrayElementReplacePatchWithLocalSchemaValidation,
} from "../array/replace.js";
import {
  applySingleRootObjectReplacePlan,
  planSingleRootObjectReplacePatch,
  readRootRecordForLocalSchemaValidation,
} from "../object/replace.js";
import {
  evaluateLocalSchemaValidationValueValidationPlan,
  planLocalSchemaValidationValueValidation,
} from "../shared/value.js";

export function applyReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): ApplyResult<S> | null {
  const acceptedValues = valuesTrusted ? null : applyKnownJsonReplacePatchWithLocalSchemaValidation(schema, state, ops);
  if (acceptedValues) return acceptedValues;
  const applied = applyReplaceOperations(state, ops, valuesTrusted);
  if (!applied.result.ok) return failedLocalSchemaValidation(state, applied.result);
  const validation = evaluateAppliedReplaceOperations(schema, state, applied.applied, valuesTrusted);
  if (!validation.ok) return validation.result;
  return okLocalSchemaValidation(applied.state as z.output<S>, applied.applied);
}

export function applyReplaceOperations(
  state: unknown,
  operations: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): { state: unknown; result: ApplyResult<z.ZodTypeAny>["result"]; applied: ReadonlyArray<JSONPatchOperation> } {
  const applied = valuesTrusted ? applyAcceptedPatch(state, operations) : applyTrustedPatch(state, operations);
  return applied.result.ok
    ? { state: applied.state, result: applied.result, applied: applied.applied }
    : { state, result: applied.result, applied: [] };
}

export function evaluateAppliedReplaceOperations<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  operations: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): { ok: true } | { ok: false; result: ApplyResult<S> | null } {
  for (const op of operations) {
    const valueValidation = planAppliedReplaceValueValidation(schema, op, valuesTrusted);
    if (valueValidation === null) return { ok: false, result: null };
    const valueFailure = evaluateLocalSchemaValidationValueValidationPlan(state, valueValidation);
    if (valueFailure) return { ok: false, result: valueFailure };
  }
  return { ok: true };
}

export function planAppliedReplaceValueValidation(schema: z.ZodType, operation: JSONPatchOperation, valuesTrusted: boolean) {
  if (operation.op !== "replace") return null;
  const valueSchema = cachedSchemaAtPointer(schema, operation.path, "value");
  if (!valueSchema) return null;
  return planLocalSchemaValidationValueValidation({
    path: operation.path,
    schema: valueSchema,
    value: operation.value,
    knownJsonAccepted: acceptsKnownJsonValue(valueSchema, operation.value),
    valuesTrusted,
  });
}

export function applySingleReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): ApplyResult<S> | null {
  const op = planSingleReplacePatch(ops);
  if (op === null) return null;
  const valueValidation = evaluateAppliedReplaceOperations(schema, state, [op], valuesTrusted);
  if (!valueValidation.ok) return valueValidation.result;
  const applied = applySingleReplaceOperation(state, op);
  return applied.result.ok
    ? okLocalSchemaValidation(applied.state as z.output<S>, applied.applied)
    : failedLocalSchemaValidation(state, applied.result);
}

export function planSingleReplacePatch(ops: ReadonlyArray<JSONPatchOperation>): Extract<JSONPatchOperation, { op: "replace" }> | null {
  if (!Array.isArray(ops) || ops.length !== 1 || !(0 in ops)) return null;
  const op = ops[0]!;
  if (validateOperationShape(op) !== null || op.op !== "replace" || typeof op.path !== "string" || op.path === "") return null;
  return op;
}

export function applySingleReplaceOperation(
  state: unknown,
  operation: Extract<JSONPatchOperation, { op: "replace" }>,
): { state: unknown; result: ApplyResult<z.ZodTypeAny>["result"]; applied: ReadonlyArray<JSONPatchOperation> } {
  const singleArrayFieldReplace = applySingleArrayFieldReplace({ state, path: operation.path, value: operation.value });
  if (singleArrayFieldReplace !== null) return { state: singleArrayFieldReplace, result: { ok: true }, applied: [operation] };
  const root = readRootRecordForLocalSchemaValidation(state);
  if (root.ok) {
    const plan = planSingleRootObjectReplacePatch(operation, root.sourceKeys);
    if (plan !== null) return { state: applySingleRootObjectReplacePlan(root.source, plan), result: { ok: true }, applied: [operation] };
  }
  const applied = applyAcceptedPatch(state, [operation]);
  return applied.result.ok
    ? { state: applied.state, result: applied.result, applied: applied.applied }
    : { state, result: applied.result, applied: [] };
}

export function applyKnownJsonReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> | null {
  const operations = planKnownJsonReplaceOperations(ops);
  if (operations === null) return null;
  const sameArrayElementReplace = applyKnownJsonSameArrayElementReplacePatchWithLocalSchemaValidation(schema, state, ops);
  if (sameArrayElementReplace) return sameArrayElementReplace;
  if (!evaluateKnownJsonReplaceValues(schema, operations)) return null;
  const applied = applyAcceptedPatch(state, operations);
  return applied.result.ok
    ? okLocalSchemaValidation(applied.state as z.output<S>, applied.applied)
    : failedLocalSchemaValidation(state, applied.result);
}

export function planKnownJsonReplaceOperations(ops: ReadonlyArray<JSONPatchOperation>): Extract<JSONPatchOperation, { op: "replace" }>[] | null {
  if (!Array.isArray(ops) || ops.length === 0) return null;
  const operations = new Array<Extract<JSONPatchOperation, { op: "replace" }>>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (validateOperationShape(op) !== null || op.op !== "replace" || typeof op.path !== "string") return null;
    operations[index] = op;
  }
  return operations;
}

export function evaluateKnownJsonReplaceValues(schema: z.ZodType, operations: ReadonlyArray<Extract<JSONPatchOperation, { op: "replace" }>>): boolean {
  for (const op of operations) {
    const valueSchema = cachedSchemaAtPointer(schema, op.path, "value");
    if (!valueSchema || !acceptsKnownJsonValue(valueSchema, op.value)) return false;
  }
  return true;
}

export function planIndependentReplacePatch(operations: ReadonlyArray<JSONPatchOperation>): boolean {
  const paths = planIndependentReplacePathsRaw(operations);
  return paths === null ? false : haveIndependentReplacePaths(paths);
}
