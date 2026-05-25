import type * as z from "zod";
import type { ApplyResult, JSONPatchOperation } from "../../foundation/json-patch/types.js";
import { applyTrustedPatch } from "../../foundation/json-patch/applyTrusted.js";
import { validateOperationShape } from "../../foundation/json-patch/apply.js";
import type { Pointer } from "../../foundation/json-pointer/pointerCore.js";
import {
  applyAppendOnlyAddPatchWithLocalSchemaValidation,
  evaluateArrayAddElementValues,
  applyIncreasingArrayAddPatchWithLocalSchemaValidation,
} from "./localSchemaArrayAdd.js";
import {
  applyKnownJsonSameArrayElementReplacePatchWithLocalSchemaValidation,
  applySameArrayFieldReplacePatchWithLocalSchemaValidation,
  applySameArrayNestedReplacePatchWithLocalSchemaValidation,
} from "./localSchemaArrayReplace.js";
import { isPlainStructuralSchema } from "./localSchemaInfo.js";
import {
  applyReplacePatchWithLocalSchemaValidation,
  applySingleReplacePatchWithLocalSchemaValidation,
  planIndependentReplacePatch,
} from "./localSchemaReplace.js";
import {
  applyRootRecordAddPatchWithLocalSchemaValidation,
  applyRootRecordRemovePatchWithLocalSchemaValidation,
} from "./localSchemaRootRecord.js";
import { applyRootObjectReplacePatchWithLocalSchemaValidation } from "./localSchemaRootReplace.js";
import {
  arrayIndexInParent,
  arrayIndexPathLocation,
} from "./localSchemaPath.js";
import { failedLocalSchemaValidation, okLocalSchemaValidation } from "./localSchemaResult.js";
import { applySequentialPatchWithLocalSchemaValidation } from "./localSchemaSequential.js";

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
