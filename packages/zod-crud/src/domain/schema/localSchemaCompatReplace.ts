import type * as z from "zod";
import {
  applyAcceptedPatch,
  type ApplyResult,
  type JSONPatchOperation,
  type JSONResult,
} from "../../foundation/json-patch/index.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import { planIndependentReplacePaths as planIndependentReplacePathsRaw } from "./localSchemaPath.js";
import type { LocalSchemaValidationValueValidationPlan } from "./localSchemaValueValidation.js";
import * as replace from "./localSchemaReplace.js";

export interface PlanIndependentReplacePatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface PlanSingleReplacePatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface SingleReplacePatchPlan {
  operation: Extract<JSONPatchOperation, { op: "replace" }>;
}

export interface ApplyReplaceOperationsInput {
  state: unknown;
  operations: ReadonlyArray<JSONPatchOperation>;
  valuesTrusted: boolean;
}

export interface ReplaceOperationsResult {
  state: unknown;
  result: JSONResult;
  applied: ReadonlyArray<JSONPatchOperation>;
}

export interface ApplySingleReplaceOperationInput {
  state: unknown;
  operation: Extract<JSONPatchOperation, { op: "replace" }>;
}

export interface KnownJsonReplacePatchPlan {
  operations: Extract<JSONPatchOperation, { op: "replace" }>[];
}

export function planIndependentReplacePatch(input: PlanIndependentReplacePatchInput): boolean {
  return replace.planIndependentReplacePatch(input.operations);
}

export function planIndependentReplacePaths(input: PlanIndependentReplacePatchInput): Pointer[] | null {
  return planIndependentReplacePathsRaw(input.operations);
}

export function planSingleReplacePatch(input: PlanSingleReplacePatchInput): SingleReplacePatchPlan | null {
  const operation = replace.planSingleReplacePatch(input.operations);
  return operation === null ? null : { operation };
}

export function applyReplaceOperations(input: ApplyReplaceOperationsInput): ReplaceOperationsResult {
  return replace.applyReplaceOperations(input.state, input.operations, input.valuesTrusted);
}

export function applySingleReplaceOperation(input: ApplySingleReplaceOperationInput): ReplaceOperationsResult {
  return replace.applySingleReplaceOperation(input.state, input.operation);
}

export function evaluateAppliedReplaceOperations<S extends z.ZodType>(input: {
  schema: S;
  state: z.output<S>;
  operations: ReadonlyArray<JSONPatchOperation>;
  valuesTrusted: boolean;
}): { ok: true } | { ok: false; result: ApplyResult<S> | null } {
  return replace.evaluateAppliedReplaceOperations(input.schema, input.state, input.operations, input.valuesTrusted);
}

export function planAppliedReplaceValueValidation(input: {
  schema: z.ZodType;
  operation: JSONPatchOperation;
  valuesTrusted: boolean;
}): LocalSchemaValidationValueValidationPlan | null {
  return replace.planAppliedReplaceValueValidation(input.schema, input.operation, input.valuesTrusted);
}

export function planKnownJsonReplaceOperations(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
}): Extract<JSONPatchOperation, { op: "replace" }>[] | null {
  return replace.planKnownJsonReplaceOperations(input.operations);
}

export function planKnownJsonReplacePatch(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
}): KnownJsonReplacePatchPlan | null {
  const operations = planKnownJsonReplaceOperations(input);
  return operations === null ? null : { operations };
}

export function applyKnownJsonReplaceOperations(input: {
  state: unknown;
  operations: ReadonlyArray<Extract<JSONPatchOperation, { op: "replace" }>>;
}): ReplaceOperationsResult {
  const applied = applyAcceptedPatch(input.state, input.operations);
  return applied.result.ok
    ? { state: applied.state, result: applied.result, applied: applied.applied }
    : { state: input.state, result: applied.result, applied: [] };
}

export function evaluateKnownJsonReplaceValues(input: {
  schema: z.ZodType;
  operations: ReadonlyArray<Extract<JSONPatchOperation, { op: "replace" }>>;
}): boolean {
  return replace.evaluateKnownJsonReplaceValues(input.schema, input.operations);
}
