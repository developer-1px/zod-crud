import type * as z from "zod";
import type { ApplyResult, JSONPatchOperation } from "../../../foundation/json-patch/types.js";
import { applyAcceptedPatch, applyTrustedPatch } from "../../../foundation/json-patch/applyTrusted.js";
import { validateOperationShape } from "../../../foundation/json-patch/apply.js";
import type { Pointer } from "../../../foundation/json-pointer/pointerCore.js";
import {
  applyAppendOnlyAddPatchWithLocalSchemaValidation,
  evaluateArrayAddElementValues,
  applyIncreasingArrayAddPatchWithLocalSchemaValidation,
} from "./arrayAdd.js";
import {
  applyKnownJsonSameArrayElementReplacePatchWithLocalSchemaValidation,
  applySameArrayFieldReplacePatchWithLocalSchemaValidation,
  applySameArrayNestedReplacePatchWithLocalSchemaValidation,
} from "./arrayReplace.js";
import {
  arrayElementSchemaAtPath,
  cachedSchemaAtPointer,
  isPlainStructuralSchema,
} from "./info.js";
import {
  applyReplacePatchWithLocalSchemaValidation,
  applySingleReplacePatchWithLocalSchemaValidation,
  planIndependentReplacePatch,
} from "./replace.js";
import {
  applyRootRecordAddPatchWithLocalSchemaValidation,
  applyRootRecordRemovePatchWithLocalSchemaValidation,
} from "./rootRecord.js";
import { applyRootObjectReplacePatchWithLocalSchemaValidation } from "./rootReplace.js";
import {
  arrayIndexInParent,
  arrayIndexPathLocation,
  readAppliedLocalOpSourceValue,
  type AppliedLocalOpSourceValue,
} from "./path.js";
import { failedLocalSchemaValidation, okLocalSchemaValidation, schemaViolation } from "./result.js";

export type LocalSchemaValidationResult<S extends z.ZodType> = ApplyResult<S> | null;

export interface LocalSchemaValidationOptions {
  valuesTrusted?: boolean;
}

export type SameArrayPatchOperationPlan =
  | { op: "add"; path: Pointer; index: number | "-"; value: unknown }
  | { op: "remove"; path: Pointer; index: number }
  | { op: "copy"; from: Pointer; path: Pointer; fromIndex: number; index: number | "-" }
  | { op: "move"; from: Pointer; path: Pointer; fromIndex: number; index: number | "-" };

export interface SameArrayPatchPlan {
  parent: Pointer;
  parentSegments: string[];
  operations: SameArrayPatchOperationPlan[];
}

export type SequentialPatchOperationPlan = Exclude<JSONPatchOperation, { op: "test" }>;

export type AppliedLocalOpValidationPlan =
  | { kind: "parse"; path: string; schema: z.ZodType; value: unknown }
  | { kind: "presence" };

export function applyPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  options: LocalSchemaValidationOptions = {},
): LocalSchemaValidationResult<S> {
  if (!isPlainStructuralSchema(schema)) return null;
  const valuesTrusted = options.valuesTrusted === true;

  const singleReplace = applySingleReplacePatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (singleReplace) return singleReplace;
  const sameArrayFieldReplace = applySameArrayFieldReplacePatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (sameArrayFieldReplace) return sameArrayFieldReplace;
  const sameArrayElementReplace = applyKnownJsonSameArrayElementReplacePatchWithLocalSchemaValidation(schema, state, ops);
  if (sameArrayElementReplace) return sameArrayElementReplace;
  const sameArrayNestedReplace = applySameArrayNestedReplacePatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (sameArrayNestedReplace) return sameArrayNestedReplace;
  const rootObjectReplace = applyRootObjectReplacePatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (rootObjectReplace) return rootObjectReplace;
  const rootRecordAdd = applyRootRecordAddPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (rootRecordAdd) return rootRecordAdd;
  const rootRecordRemove = applyRootRecordRemovePatchWithLocalSchemaValidation(schema, state, ops);
  if (rootRecordRemove) return rootRecordRemove;
  if (planIndependentReplacePatch(ops)) return applyReplacePatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);

  const appendOnlyAdd = applyAppendOnlyAddPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (appendOnlyAdd) return appendOnlyAdd;
  const increasingAdd = applyIncreasingArrayAddPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (increasingAdd) return increasingAdd;
  const arrayBatch = applySameArrayPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (arrayBatch) return arrayBatch;
  return applySequentialPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
}

export function applySameArrayPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): ApplyResult<S> | null {
  const plan = planSameArrayPatch(ops);
  if (plan === null) return null;
  const addOperations = plan.operations.filter((op): op is Extract<SameArrayPatchOperationPlan, { op: "add" }> => op.op === "add");
  const valueValidation = evaluateArrayAddElementValues(schema, state, plan.parent, addOperations, valuesTrusted);
  if (!valueValidation.ok) return valueValidation.result;
  const applied = applyTrustedPatch(state, ops, { valuesTrusted: true });
  if (!applied.result.ok) return failedLocalSchemaValidation(state, applied.result);
  return okLocalSchemaValidation(applied.state as z.output<S>, applied.applied);
}

export function planSameArrayPatch(ops: ReadonlyArray<JSONPatchOperation>): SameArrayPatchPlan | null {
  if (!Array.isArray(ops) || ops.length < 1) return null;
  if (!(0 in ops)) return null;
  const first = ops[0]!;
  if (!isSameArrayPatchOperationCandidate(first)) return null;
  const firstLocation = arrayIndexPathLocation(first.path);
  if (firstLocation === null) return null;
  const operations = planSameArrayPatchOperations(ops, firstLocation.parent);
  return operations === null ? null : { parent: firstLocation.parent, parentSegments: firstLocation.parentSegments, operations };
}

export function planSameArrayPatchOperations(ops: ReadonlyArray<JSONPatchOperation>, parent: Pointer): SameArrayPatchOperationPlan[] | null {
  if (!Array.isArray(ops) || ops.length < 1) return null;
  const operations = new Array<SameArrayPatchOperationPlan>(ops.length);
  for (let index = 0; index < ops.length; index++) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (!isSameArrayPatchOperationCandidate(op)) return null;
    const location = arrayIndexInParent(op.path, parent);
    if (location === null) return null;
    const pathIndex = location.index;
    if (op.op === "add") operations[index] = { op: "add", path: op.path, index: pathIndex, value: op.value };
    else if (op.op === "remove") {
      if (pathIndex === "-") return null;
      operations[index] = { op: "remove", path: op.path, index: pathIndex };
    } else {
      const fromLocation = arrayIndexInParent(op.from, parent);
      if (fromLocation === null || fromLocation.index === "-") return null;
      operations[index] = { op: op.op, from: op.from, path: op.path, fromIndex: fromLocation.index, index: pathIndex };
    }
  }
  return operations;
}

function isSameArrayPatchOperationCandidate(op: JSONPatchOperation): op is Extract<JSONPatchOperation, { op: "add" } | { op: "remove" } | { op: "copy" } | { op: "move" }> {
  return !!op
    && typeof op === "object"
    && validateOperationShape(op) === null
    && (op.op === "add" || op.op === "remove" || op.op === "copy" || op.op === "move")
    && typeof op.path === "string";
}

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
