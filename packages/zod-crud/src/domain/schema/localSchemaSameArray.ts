import type * as z from "zod";
import type { ApplyResult, JSONPatchOperation } from "../../foundation/json-patch/index.js";
import { applyTrustedPatch } from "../../foundation/json-patch/index.js";
import { validateOperationShape } from "../../foundation/json-patch/apply.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import { evaluateArrayAddElementValues } from "./localSchemaArrayAdd.js";
import {
  arrayIndexInParent,
  arrayIndexPathLocation,
} from "./localSchemaPath.js";
import { failedLocalSchemaValidation, okLocalSchemaValidation } from "./localSchemaResult.js";

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
