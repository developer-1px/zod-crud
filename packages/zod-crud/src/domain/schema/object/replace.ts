import type * as z from "zod";
import type { ApplyResult, JSONPatchOperation } from "../../../foundation/patch/types.js";
import { validateOperationShape } from "../../../foundation/patch/apply.js";
import {
  acceptsKnownJsonValue,
  acceptsKnownJsonValueWithValidator,
  knownJsonValueValidatorForSchema,
} from "../validation/knownJson.js";
import {
  copyRootRecord,
  copyRootRecordKeys,
  createDataKeySet,
  objectHasOwn,
  writeRootRecordValue,
} from "./value.js";
import { okLocalSchemaValidation } from "../validation/result.js";
import {
  evaluateLocalSchemaValidationValueValidationPlan,
  planLocalSchemaValidationValueValidation,
  toAppliedReplaceOperations,
  type AppliedReplaceValueValidationOperation,
  type LocalSchemaValidationValueValidationPlan,
} from "../validation/value.js";
import { getDef, getObjectShape } from "../zod.js";

export type RootObjectReplacePatchStrategy = "orderedReplace" | "copyWrite";

export interface RootObjectReplaceOperationPlan extends AppliedReplaceValueValidationOperation {
  op: "replace";
  key: string;
}

export interface RootObjectReplacePatchPlan {
  operations: RootObjectReplaceOperationPlan[];
  strategy: RootObjectReplacePatchStrategy;
}

export interface SingleRootObjectReplacePatchPlan {
  operation: Extract<JSONPatchOperation, { op: "replace" }>;
  key: string;
}

export type RootObjectReplaceValueSource =
  | { kind: "object"; shape: Record<string, z.ZodType | undefined> }
  | { kind: "record"; schema: z.ZodType; acceptsKnownJson: (value: unknown) => boolean };

export function applyRootObjectReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): ApplyResult<S> | null {
  if (!Array.isArray(ops) || ops.length < 2) return null;
  const root = readRootRecordForLocalSchemaValidation(state);
  if (!root.ok) return null;
  const plan = planRootObjectReplacePatch(ops, root.sourceKeys);
  if (plan === null) return null;
  const valueSource = rootObjectReplaceValueSourceForLocalSchemaValidation(schema);
  if (valueSource === null) return null;
  const valueValidation = evaluateRootObjectReplaceValues(state, plan.operations, valueSource, valuesTrusted);
  if (!valueValidation.ok) return valueValidation.result;
  const resultState = applyRootObjectReplacePlan(root.source, root.sourceKeys, plan);
  return okLocalSchemaValidation(resultState as z.output<S>, toAppliedReplaceOperations(plan.operations));
}

export function rootObjectReplaceValueSourceForLocalSchemaValidation(schema: z.ZodType): RootObjectReplaceValueSource | null {
  const shape = getObjectShape(schema);
  if (shape !== null) return { kind: "object", shape };
  const rootDef = getDef(schema);
  const recordValueSchema = rootDef.type === "record" ? (rootDef.valueType ?? null) : null;
  if (recordValueSchema === null) return null;
  const recordValueValidator = knownJsonValueValidatorForSchema(recordValueSchema);
  return {
    kind: "record",
    schema: recordValueSchema,
    acceptsKnownJson: (value) => acceptsKnownJsonValueWithValidator(recordValueValidator, value),
  };
}

export function evaluateRootObjectReplaceValues<S extends z.ZodType>(
  state: z.output<S>,
  operations: ReadonlyArray<RootObjectReplaceOperationPlan>,
  source: RootObjectReplaceValueSource,
  valuesTrusted: boolean,
): { ok: true } | { ok: false; result: ApplyResult<S> | null } {
  for (const op of operations) {
    const valueValidation = planRootObjectReplaceValueValidation(source, op, valuesTrusted);
    if (valueValidation === null) return { ok: false, result: null };
    const valueFailure = evaluateLocalSchemaValidationValueValidationPlan(state, valueValidation);
    if (valueFailure) return { ok: false, result: valueFailure };
  }
  return { ok: true };
}

export function planRootObjectReplaceValueValidation(
  source: RootObjectReplaceValueSource,
  operation: RootObjectReplaceOperationPlan,
  valuesTrusted: boolean,
): LocalSchemaValidationValueValidationPlan | null {
  const valueSchema = rootObjectReplaceValueSchema(source, operation.key);
  if (valueSchema === null) return null;
  return planLocalSchemaValidationValueValidation({
    path: operation.path,
    schema: valueSchema,
    value: operation.value,
    knownJsonAccepted: source.kind === "record" ? source.acceptsKnownJson(operation.value) : acceptsKnownJsonValue(valueSchema, operation.value),
    valuesTrusted,
  });
}

export function applyRootObjectReplacePlan(
  source: Record<string, unknown>,
  sourceKeys: ReadonlyArray<string>,
  plan: RootObjectReplacePatchPlan,
): Record<string, unknown> {
  const next = plan.strategy === "orderedReplace" ? {} : copyRootRecordKeys(source, sourceKeys);
  for (const op of plan.operations) writeRootRecordValue(next, op.key, op.value);
  return next;
}

export function applySingleRootObjectReplacePlan(
  source: Record<string, unknown>,
  plan: SingleRootObjectReplacePatchPlan,
): Record<string, unknown> {
  const next = copyRootRecord(source);
  writeRootRecordValue(next, plan.key, plan.operation.value);
  return next;
}

export function planRootObjectReplacePatch(
  operationsInput: ReadonlyArray<JSONPatchOperation>,
  sourceKeys: ReadonlyArray<string>,
): RootObjectReplacePatchPlan | null {
  const operations = planRootObjectReplaceOperations(operationsInput, sourceKeys);
  return operations === null ? null : { operations, strategy: planRootObjectReplaceStrategy(operations, sourceKeys) };
}

export function planRootObjectReplaceOperations(
  ops: ReadonlyArray<JSONPatchOperation>,
  sourceKeys: ReadonlyArray<string>,
): RootObjectReplaceOperationPlan[] | null {
  if (!Array.isArray(ops) || ops.length < 2 || !Array.isArray(sourceKeys)) return null;
  const sourceKeySet = createDataKeySet(sourceKeys);
  const operations: RootObjectReplaceOperationPlan[] = [];
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (validateOperationShape(op) !== null || op.op !== "replace" || typeof op.path !== "string" || op.path[0] !== "/" || op.path.includes("~") || op.path.indexOf("/", 1) !== -1) return null;
    const key = op.path.slice(1);
    if (key === "" || !objectHasOwn.call(sourceKeySet, key)) return null;
    operations.push({ op: "replace", path: op.path, key, value: op.value });
  }
  return operations;
}

export function planSingleRootObjectReplacePatch(
  operation: Extract<JSONPatchOperation, { op: "replace" }>,
  sourceKeys: ReadonlyArray<string>,
): SingleRootObjectReplacePatchPlan | null {
  if (
    !Array.isArray(sourceKeys)
    || validateOperationShape(operation) !== null
    || operation.op !== "replace"
    || typeof operation.path !== "string"
    || operation.path[0] !== "/"
    || operation.path.includes("~")
    || operation.path.indexOf("/", 1) !== -1
  ) {
    return null;
  }

  const key = operation.path.slice(1);
  if (key === "") return null;
  for (const sourceKey of sourceKeys) {
    if (sourceKey === key) return { operation, key };
  }
  return null;
}

export function planRootObjectReplaceStrategy(
  operations: ReadonlyArray<RootObjectReplaceOperationPlan>,
  sourceKeys: ReadonlyArray<string>,
): RootObjectReplacePatchStrategy {
  if (operations.length !== sourceKeys.length) return "copyWrite";
  for (let index = 0; index < operations.length; index += 1) {
    if (operations[index]!.key !== sourceKeys[index]) return "copyWrite";
  }
  return "orderedReplace";
}

export function readRootRecordForLocalSchemaValidation(state: unknown):
  | { ok: true; source: Record<string, unknown>; sourceKeys: string[] }
  | { ok: false } {
  if (state === null || typeof state !== "object" || Array.isArray(state)) return { ok: false };
  const source = state as Record<string, unknown>;
  return { ok: true, source, sourceKeys: Object.keys(source) };
}

function rootObjectReplaceValueSchema(source: RootObjectReplaceValueSource, key: string): z.ZodType | null {
  if (source.kind === "record") return source.schema;
  return objectHasOwn.call(source.shape, key) ? (source.shape[key] ?? null) : null;
}
