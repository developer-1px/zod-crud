import type * as z from "zod";
import type { ApplyResult, JSONPatchOperation } from "../../foundation/json-patch/index.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import * as add from "./localSchemaArrayAdd.js";
import { readArrayAtSegments } from "./localSchemaPath.js";
import { okLocalSchemaValidation } from "./localSchemaResult.js";
import {
  planArrayAddAppliedOperations,
  type AppliedAddValueValidationOperation,
} from "./localSchemaValueValidation.js";

export function planAppendOnlyArrayAddPatch(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
}): add.AppendOnlyArrayAddPatchPlan | null {
  return add.planAppendOnlyArrayAddPatch(input.operations);
}

export function planAppendOnlyArrayAddValues(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
  appendPath: Pointer;
}): unknown[] | null {
  return add.planAppendOnlyArrayAddValues(input.operations, input.appendPath);
}

export function planIncreasingArrayAddPatch(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
}): add.IncreasingArrayAddPatchPlan | null {
  return add.planIncreasingArrayAddPatch(input.operations);
}

export function planIncreasingArrayAddValues(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
  parent: Pointer;
  start: number;
}): unknown[] | null {
  return add.planIncreasingArrayAddValues(input.operations, input.parent, input.start);
}

export function evaluateArrayAddElementValues<S extends z.ZodType>(input: {
  schema: S;
  state: z.output<S>;
  parent: Pointer;
  operations: ReadonlyArray<AppliedAddValueValidationOperation>;
  valuesTrusted: boolean;
}): { ok: true } | { ok: false; result: ApplyResult<S> | null } {
  return add.evaluateArrayAddElementValues(input.schema, input.state, input.parent, input.operations, input.valuesTrusted);
}

export function applyArrayAddPlan(input: {
  state: unknown;
  parentSegments: ReadonlyArray<string>;
  array: ReadonlyArray<unknown>;
  start: number;
  values: ReadonlyArray<unknown>;
}): unknown | null {
  return add.applyArrayAddPlan(input.state, input.parentSegments, input.array, input.start, input.values);
}

export function applyValidatedArrayAddPlan<S extends z.ZodType>(input: {
  schema: S;
  state: z.output<S>;
  parent: Pointer;
  parentSegments: ReadonlyArray<string>;
  array: ReadonlyArray<unknown>;
  start: number;
  values: ReadonlyArray<unknown>;
  valuesTrusted: boolean;
}): ApplyResult<S> | null {
  const applied = planArrayAddAppliedOperations({ parent: input.parent, start: input.start, values: input.values });
  const validation = evaluateArrayAddElementValues({
    schema: input.schema,
    state: input.state,
    parent: input.parent,
    operations: applied,
    valuesTrusted: input.valuesTrusted,
  });
  if (!validation.ok) return validation.result;
  const nextState = add.applyArrayAddPlan(input.state, input.parentSegments, input.array, input.start, input.values);
  return nextState === null ? null : okLocalSchemaValidation(nextState as z.output<S>, applied);
}

export function applyValidatedArrayAddPlanAtSegments<S extends z.ZodType>(input: {
  schema: S;
  state: z.output<S>;
  parent: Pointer;
  parentSegments: ReadonlyArray<string>;
  start: number | "append";
  values: ReadonlyArray<unknown>;
  valuesTrusted: boolean;
}): ApplyResult<S> | null {
  const current = readArrayAtSegments(input.state, input.parentSegments);
  if (!current.ok) return null;
  const start = input.start === "append" ? current.array.length : input.start;
  return applyValidatedArrayAddPlan({ ...input, array: current.array, start });
}
