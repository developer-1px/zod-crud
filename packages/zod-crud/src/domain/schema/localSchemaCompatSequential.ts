import type * as z from "zod";
import type { ApplyResult, JSONPatchOperation } from "../../foundation/json-patch/index.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import {
  readAppliedLocalOpSourceValue as readAppliedLocalOpSourceValueAtState,
  readArrayAtSegments as readArrayAtSegmentsRaw,
  readFirstArrayNestedPath as readFirstArrayNestedPathRaw,
} from "./localSchemaPath.js";
import * as sequential from "./localSchemaSequential.js";

export function applySequentialLocalOperations<S extends z.ZodType>(input: {
  schema: S;
  state: z.output<S>;
  operations: ReadonlyArray<sequential.SequentialPatchOperationPlan>;
  valuesTrusted: boolean;
}): { ok: true; state: unknown; applied: JSONPatchOperation[] } | { ok: false; result: ApplyResult<S> | null } {
  return sequential.applySequentialLocalOperations(input.schema, input.state, input.operations, input.valuesTrusted);
}

export function applySequentialLocalOperation<S extends z.ZodType>(input: {
  schema: S;
  state: z.output<S>;
  current: unknown;
  operation: sequential.SequentialPatchOperationPlan;
  valuesTrusted: boolean;
}): { ok: true; state: unknown; applied: JSONPatchOperation } | { ok: false; result: ApplyResult<S> | null } {
  return sequential.applySequentialLocalOperation(input.schema, input.state, input.current, input.operation, input.valuesTrusted);
}

export function applySequentialLocalOperationPatch(input: {
  current: unknown;
  operation: sequential.SequentialPatchOperationPlan;
  valuesTrusted: boolean;
}): { state: unknown; result: ApplyResult<z.ZodTypeAny>["result"]; applied: ReadonlyArray<JSONPatchOperation> } {
  return sequential.applySequentialLocalOperationPatch(input.current, input.operation, input.valuesTrusted);
}

export function planSequentialPatch(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
}): { operations: sequential.SequentialPatchOperationPlan[] } | null {
  return sequential.planSequentialPatch(input.operations);
}

export function planAppliedLocalOpValidation(input: {
  schema: z.ZodType;
  operation: JSONPatchOperation;
  sourceValue: { ok: true; value: unknown } | { ok: false };
}): sequential.AppliedLocalOpValidationPlan | null {
  return sequential.planAppliedLocalOpValidation(input.schema, input.operation, input.sourceValue);
}

export function readAppliedLocalOpSourceValue(input: {
  state: unknown;
  operation: JSONPatchOperation;
}): { ok: true; value: unknown } | { ok: false } {
  return readAppliedLocalOpSourceValueAtState(input.state, input.operation);
}

export function readArrayAtSegments(input: {
  state: unknown;
  segments: ReadonlyArray<string>;
}): { ok: true; array: ReadonlyArray<unknown> } | { ok: false } {
  return readArrayAtSegmentsRaw(input.state, input.segments);
}

export function readFirstArrayNestedPath(input: {
  state: unknown;
  path: Pointer;
}): ReturnType<typeof readFirstArrayNestedPathRaw> {
  return readFirstArrayNestedPathRaw(input.state, input.path);
}
