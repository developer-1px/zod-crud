import type * as z from "zod";
import type { ApplyResult, JSONPatchOperation } from "../../../foundation/json-patch/types.js";
import { validateOperationShape } from "../../../foundation/json-patch/apply.js";
import { replaceValueAtSegments } from "../../../foundation/json-patch/replaceValueAtSegments.js";
import { parsePointer, type Pointer } from "../../../foundation/json-pointer/pointerCore.js";
import {
  arrayElementSchemaAtParent,
} from "./info.js";
import {
  acceptsKnownJsonValueWithValidator,
  knownJsonValueValidatorForSchema,
} from "./knownJson.js";
import {
  arrayIndexInParent,
  arrayIndexPathLocation,
  readArrayAtSegments,
} from "./path.js";
import { okLocalSchemaValidation } from "./result.js";
import {
  evaluateAppliedAddValueValidationPlan,
  planArrayAddAppliedOperations,
} from "./valueValidation.js";

export interface IncreasingArrayAddPatchPlan {
  parent: Pointer;
  parentSegments: string[];
  start: number;
  values: unknown[];
}

export interface AppendOnlyArrayAddPatchPlan {
  parent: Pointer;
  parentSegments: string[];
  values: unknown[];
}

export function applyAppendOnlyAddPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): ApplyResult<S> | null {
  const plan = planAppendOnlyArrayAddPatch(ops);
  if (plan === null) return null;
  return applyValidatedArrayAddPlanAtSegments(schema, state, plan.parent, plan.parentSegments, "append", plan.values, valuesTrusted);
}

export function planAppendOnlyArrayAddPatch(ops: ReadonlyArray<JSONPatchOperation>): AppendOnlyArrayAddPatchPlan | null {
  if (!Array.isArray(ops) || ops.length < 2) return null;
  if (!(0 in ops)) return null;
  const first = ops[0]!;
  if (!isAppendArrayAddOperationCandidate(first)) return null;
  const appendPath = first.path;
  const parent = appendPath.slice(0, -2) as Pointer;
  const values = planAppendOnlyArrayAddValues(ops, appendPath);
  if (values === null) return null;
  let parentSegments: string[];
  try {
    parentSegments = parsePointer(parent);
  } catch {
    return null;
  }
  return { parent, parentSegments, values };
}

export function planAppendOnlyArrayAddValues(ops: ReadonlyArray<JSONPatchOperation>, appendPath: Pointer): unknown[] | null {
  if (!Array.isArray(ops) || ops.length < 2 || !appendPath.endsWith("/-")) return null;
  const values = new Array<unknown>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (!isAppendArrayAddOperationCandidate(op) || op.path !== appendPath) return null;
    values[index] = op.value;
  }
  return values;
}

export function applyIncreasingArrayAddPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): ApplyResult<S> | null {
  const plan = planIncreasingArrayAddPatch(ops);
  if (plan === null) return null;
  return applyValidatedArrayAddPlanAtSegments(schema, state, plan.parent, plan.parentSegments, plan.start, plan.values, valuesTrusted);
}

export function planIncreasingArrayAddPatch(ops: ReadonlyArray<JSONPatchOperation>): IncreasingArrayAddPatchPlan | null {
  if (!Array.isArray(ops) || ops.length < 2) return null;
  if (!(0 in ops)) return null;
  const first = ops[0]!;
  if (!isIndexedArrayAddOperationCandidate(first)) return null;
  const firstLocation = arrayIndexPathLocation(first.path);
  if (firstLocation === null || firstLocation.index === "-") return null;
  const { parent, parentSegments } = firstLocation;
  const start = firstLocation.index;
  const values = planIncreasingArrayAddValues(ops, parent, start);
  return values === null ? null : { parent, parentSegments, start, values };
}

export function planIncreasingArrayAddValues(ops: ReadonlyArray<JSONPatchOperation>, parent: Pointer, start: number): unknown[] | null {
  if (!Array.isArray(ops) || ops.length < 2) return null;
  const values = new Array<unknown>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (!isIndexedArrayAddOperationCandidate(op)) return null;
    const location = arrayIndexInParent(op.path, parent);
    if (location === null || location.index === "-" || location.index !== start + index) return null;
    values[index] = op.value;
  }
  return values;
}

export function evaluateArrayAddElementValues<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  parent: Pointer,
  operations: ReadonlyArray<{ op: "add"; path: Pointer; value: unknown }>,
  valuesTrusted: boolean,
): { ok: true } | { ok: false; result: ApplyResult<S> | null } {
  const elementSchema = arrayElementSchemaAtParent(schema, parent);
  if (elementSchema === null) return { ok: false, result: null };
  const elementValidator = knownJsonValueValidatorForSchema(elementSchema);
  const valueFailure = evaluateAppliedAddValueValidationPlan(
    state,
    operations,
    elementSchema,
    (value) => acceptsKnownJsonValueWithValidator(elementValidator, value),
    valuesTrusted,
  );
  return valueFailure ? { ok: false, result: valueFailure } : { ok: true };
}

export function applyValidatedArrayAddPlanAtSegments<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  parent: Pointer,
  parentSegments: ReadonlyArray<string>,
  startInput: number | "append",
  values: ReadonlyArray<unknown>,
  valuesTrusted: boolean,
): ApplyResult<S> | null {
  const current = readArrayAtSegments(state, parentSegments);
  if (!current.ok) return null;
  const start = startInput === "append" ? current.array.length : startInput;
  const applied = planArrayAddAppliedOperations({ parent, start, values });
  const valueValidation = evaluateArrayAddElementValues(schema, state, parent, applied, valuesTrusted);
  if (!valueValidation.ok) return valueValidation.result;
  const nextState = applyArrayAddPlan(state, parentSegments, current.array, start, values);
  return nextState === null ? null : okLocalSchemaValidation(nextState as z.output<S>, applied);
}

export function applyArrayAddPlan(
  state: unknown,
  parentSegments: ReadonlyArray<string>,
  array: ReadonlyArray<unknown>,
  start: number,
  values: ReadonlyArray<unknown>,
): unknown | null {
  if (start < 0 || start > array.length) return null;
  const nextArray = start === array.length ? array.concat(values) : array.slice(0, start).concat(values, array.slice(start));
  return replaceValueAtSegments(state, parentSegments, 0, nextArray);
}

function isAppendArrayAddOperationCandidate(op: JSONPatchOperation): op is Extract<JSONPatchOperation, { op: "add" }> {
  return !!op && typeof op === "object" && validateOperationShape(op) === null && op.op === "add" && typeof op.path === "string" && op.path.endsWith("/-");
}

function isIndexedArrayAddOperationCandidate(op: JSONPatchOperation): op is Extract<JSONPatchOperation, { op: "add" }> {
  return !!op && typeof op === "object" && validateOperationShape(op) === null && op.op === "add" && typeof op.path === "string" && !op.path.endsWith("/-");
}
