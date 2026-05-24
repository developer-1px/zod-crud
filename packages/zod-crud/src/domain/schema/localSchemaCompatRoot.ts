import type * as z from "zod";
import type { ApplyResult, JSONPatchOperation } from "../../foundation/json-patch/index.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import type { LocalSchemaValidationValueValidationPlan } from "./localSchemaValueValidation.js";
import {
  createDataKeySet,
  removedRootKeysMatchSuffix,
} from "./localSchemaObject.js";
import * as rootRecord from "./localSchemaRootRecord.js";
import * as rootReplace from "./localSchemaRootReplace.js";

export function readRootRecordForLocalSchemaValidation(input: { state: unknown }):
  | { ok: true; source: Record<string, unknown>; sourceKeys: string[] }
  | { ok: false } {
  return rootReplace.readRootRecordForLocalSchemaValidation(input.state);
}

export function planSingleRootObjectReplacePatch(input: {
  operation: JSONPatchOperation;
  sourceKeys: ReadonlyArray<string>;
}): rootReplace.SingleRootObjectReplacePatchPlan | null {
  return input.operation.op === "replace"
    ? rootReplace.planSingleRootObjectReplacePatch(input.operation, input.sourceKeys)
    : null;
}

export function applySingleRootObjectReplacePlan(input: {
  source: Record<string, unknown>;
  plan: rootReplace.SingleRootObjectReplacePatchPlan;
}): Record<string, unknown> {
  return rootReplace.applySingleRootObjectReplacePlan(input.source, input.plan);
}

export function planRootObjectReplacePatch(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
  sourceKeys: ReadonlyArray<string>;
}): rootReplace.RootObjectReplacePatchPlan | null {
  return rootReplace.planRootObjectReplacePatch(input.operations, input.sourceKeys);
}

export function planRootObjectReplaceOperations(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
  sourceKeys: ReadonlyArray<string>;
}): rootReplace.RootObjectReplaceOperationPlan[] | null {
  return rootReplace.planRootObjectReplaceOperations(input.operations, input.sourceKeys);
}

export function planRootObjectReplaceStrategy(input: {
  operations: ReadonlyArray<rootReplace.RootObjectReplaceOperationPlan>;
  sourceKeys: ReadonlyArray<string>;
}): rootReplace.RootObjectReplacePatchStrategy {
  return rootReplace.planRootObjectReplaceStrategy(input.operations, input.sourceKeys);
}

export function applyRootObjectReplacePlan(input: {
  source: Record<string, unknown>;
  sourceKeys: ReadonlyArray<string>;
  plan: rootReplace.RootObjectReplacePatchPlan;
}): Record<string, unknown> {
  return rootReplace.applyRootObjectReplacePlan(input.source, input.sourceKeys, input.plan);
}

export function evaluateRootObjectReplaceValues<S extends z.ZodType>(input: {
  state: z.output<S>;
  operations: ReadonlyArray<rootReplace.RootObjectReplaceOperationPlan>;
  source: rootReplace.RootObjectReplaceValueSource;
  valuesTrusted: boolean;
}): { ok: true } | { ok: false; result: ApplyResult<S> | null } {
  return rootReplace.evaluateRootObjectReplaceValues(input.state, input.operations, input.source, input.valuesTrusted);
}

export function planRootObjectReplaceValueValidation(input: {
  source: rootReplace.RootObjectReplaceValueSource;
  operation: rootReplace.RootObjectReplaceOperationPlan;
  valuesTrusted: boolean;
}): LocalSchemaValidationValueValidationPlan | null {
  return rootReplace.planRootObjectReplaceValueValidation(input.source, input.operation, input.valuesTrusted);
}

export function planRootRecordAddPatch(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
}): rootRecord.RootRecordAddPatchPlan | null {
  return rootRecord.planRootRecordAddPatch(input.operations);
}

export function planRootRecordAddOperations(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
}): rootRecord.RootRecordAddOperationPlan[] | null {
  return rootRecord.planRootRecordAddOperations(input.operations);
}

export function evaluateRootRecordAddValues<S extends z.ZodType>(input: {
  schema: S;
  state: z.output<S>;
  operations: ReadonlyArray<rootRecord.RootRecordAddOperationPlan>;
  valuesTrusted: boolean;
}): { ok: true } | { ok: false; result: ApplyResult<S> | null } {
  return rootRecord.evaluateRootRecordAddValues(input.schema, input.state, input.operations, input.valuesTrusted);
}

export function planRootRecordAddValueValidation(input: {
  schema: z.ZodType;
  operation: { op: "add"; path: Pointer; value: unknown };
  valuesTrusted: boolean;
}): LocalSchemaValidationValueValidationPlan | null {
  return rootRecord.planRootRecordAddValueValidation(
    input.schema,
    input.operation as rootRecord.RootRecordAddOperationPlan,
    input.valuesTrusted,
  );
}

export function applyRootRecordAddPlan(input: {
  source: Record<string, unknown>;
  plan: rootRecord.RootRecordAddPatchPlan;
}): Record<string, unknown> {
  return rootRecord.applyRootRecordAddPlan(input.source, input.plan);
}

export function planRootRecordRemovePatch(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
  sourceKeys: ReadonlyArray<string>;
}): rootRecord.RootRecordRemovePatchPlan | null {
  return rootRecord.planRootRecordRemovePatch(input.operations, input.sourceKeys);
}

export function planRootRecordRemoveOperations(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
  sourceKeys: ReadonlyArray<string>;
}): rootRecord.RootRecordRemoveOperationPlan[] | null {
  return rootRecord.planRootRecordRemoveOperations(input.operations, input.sourceKeys);
}

export function planRootRecordRemoveStrategy(input: {
  sourceKeys: ReadonlyArray<string>;
  operations: ReadonlyArray<rootRecord.RootRecordRemoveOperationPlan>;
}): { strategy: rootRecord.RootRecordRemovePatchStrategy; keepCount: number } {
  const keepCount = input.sourceKeys.length - input.operations.length;
  const removedKeys = createDataKeySet(input.operations.map((op) => op.key));
  const strategy: rootRecord.RootRecordRemovePatchStrategy = input.operations.length === input.sourceKeys.length
    ? "clear"
    : removedRootKeysMatchSuffix(input.sourceKeys, keepCount, removedKeys)
      ? "copyPrefix"
      : input.operations.length * 2 < input.sourceKeys.length
        ? "copyDelete"
        : "rebuild";
  return { strategy, keepCount };
}

export function applyRootRecordRemovePlan(input: {
  source: Record<string, unknown>;
  sourceKeys: ReadonlyArray<string>;
  plan: rootRecord.RootRecordRemovePatchPlan;
}): Record<string, unknown> {
  return rootRecord.applyRootRecordRemovePlan(input.source, input.sourceKeys, input.plan);
}
