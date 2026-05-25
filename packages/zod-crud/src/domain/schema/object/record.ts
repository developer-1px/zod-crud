import type * as z from "zod";
import type { ApplyResult, JSONPatchOperation } from "../../../foundation/patch/types.js";
import { validateOperationShape } from "../../../foundation/patch/apply.js";
import {
  acceptsKnownJsonValueWithValidator,
  isPlainStringKeySchema,
  knownJsonValueValidatorForSchema,
} from "../shared/knownJson.js";
import {
  copyRootRecord,
  copyRootRecordKeyPrefix,
  copyRootRecordKeys,
  createDataKeySet,
  objectHasOwn,
  removedRootKeysMatchSuffix,
  writeRootRecordValue,
} from "./value.js";
import { okLocalSchemaValidation } from "../shared/result.js";
import { readRootRecordForLocalSchemaValidation } from "./replace.js";
import {
  evaluateLocalSchemaValidationValueValidationPlan,
  planLocalSchemaValidationValueValidation,
  toAppliedAddOperations,
  toAppliedRemoveOperations,
  type AppliedAddValueValidationOperation,
  type AppliedRemoveOperation,
} from "../shared/value.js";
import { getDef } from "../zod.js";

export type RootRecordRemovePatchStrategy = "clear" | "copyPrefix" | "copyDelete" | "rebuild";

export interface RootRecordAddOperationPlan extends AppliedAddValueValidationOperation {
  op: "add";
  key: string;
}

export interface RootRecordAddPatchPlan {
  operations: RootRecordAddOperationPlan[];
}

export interface RootRecordRemoveOperationPlan extends AppliedRemoveOperation {
  op: "remove";
  key: string;
}

export interface RootRecordRemovePatchPlan {
  operations: RootRecordRemoveOperationPlan[];
  strategy: RootRecordRemovePatchStrategy;
  keepCount: number;
}

export function applyRootRecordRemovePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> | null {
  if (!Array.isArray(ops) || ops.length === 0) return null;
  const root = readRootRecordForLocalSchemaValidation(state);
  if (!root.ok) return null;
  if (rootRecordValueSchemaForLocalSchemaValidation(schema) === null) return null;
  const plan = planRootRecordRemovePatch(ops, root.sourceKeys);
  if (plan === null) return null;
  const next = applyRootRecordRemovePlan(root.source, root.sourceKeys, plan);
  return okLocalSchemaValidation(next as z.output<S>, toAppliedRemoveOperations(plan.operations));
}

export function applyRootRecordAddPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): ApplyResult<S> | null {
  if (!Array.isArray(ops) || ops.length === 0) return null;
  const root = readRootRecordForLocalSchemaValidation(state);
  if (!root.ok) return null;
  const plan = planRootRecordAddPatch(ops);
  if (plan === null) return null;
  const valueValidation = evaluateRootRecordAddValues(schema, state, plan.operations, valuesTrusted);
  if (!valueValidation.ok) return valueValidation.result;
  const next = applyRootRecordAddPlan(root.source, plan);
  return okLocalSchemaValidation(next as z.output<S>, toAppliedAddOperations(plan.operations));
}

export function evaluateRootRecordAddValues<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  operations: ReadonlyArray<RootRecordAddOperationPlan>,
  valuesTrusted: boolean,
): { ok: true } | { ok: false; result: ApplyResult<S> | null } {
  for (const operation of operations) {
    const valueValidation = planRootRecordAddValueValidation(schema, operation, valuesTrusted);
    if (valueValidation === null) return { ok: false, result: null };
    const valueFailure = evaluateLocalSchemaValidationValueValidationPlan(state, valueValidation);
    if (valueFailure) return { ok: false, result: valueFailure };
  }
  return { ok: true };
}

export function planRootRecordAddValueValidation(schema: z.ZodType, operation: RootRecordAddOperationPlan, valuesTrusted: boolean) {
  const valueSchema = rootRecordValueSchemaForLocalSchemaValidation(schema);
  if (valueSchema === null) return null;
  const valueValidator = knownJsonValueValidatorForSchema(valueSchema);
  return planLocalSchemaValidationValueValidation({
    path: operation.path,
    schema: valueSchema,
    value: operation.value,
    knownJsonAccepted: acceptsKnownJsonValueWithValidator(valueValidator, operation.value),
    valuesTrusted,
  });
}

export function rootRecordValueSchemaForLocalSchemaValidation(schema: z.ZodType): z.ZodType | null {
  const rootDef = getDef(schema);
  if (rootDef.type !== "record" || (rootDef.keyType && !isPlainStringKeySchema(rootDef.keyType)) || !rootDef.valueType) return null;
  return rootDef.valueType;
}

export function applyRootRecordAddPlan(source: Record<string, unknown>, plan: RootRecordAddPatchPlan): Record<string, unknown> {
  const next = copyRootRecord(source);
  for (const op of plan.operations) writeRootRecordValue(next, op.key, op.value);
  return next;
}

export function planRootRecordAddPatch(ops: ReadonlyArray<JSONPatchOperation>): RootRecordAddPatchPlan | null {
  const operations = planRootRecordAddOperations(ops);
  return operations === null ? null : { operations };
}

export function planRootRecordAddOperations(ops: ReadonlyArray<JSONPatchOperation>): RootRecordAddOperationPlan[] | null {
  if (!Array.isArray(ops) || ops.length === 0) return null;
  const operations: RootRecordAddOperationPlan[] = [];
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (validateOperationShape(op) !== null || op.op !== "add" || typeof op.path !== "string" || op.path === "" || op.path[0] !== "/" || op.path.includes("~") || op.path.indexOf("/", 1) !== -1) return null;
    operations.push({ op: "add", path: op.path, key: op.path.slice(1), value: op.value });
  }
  return operations;
}

export function applyRootRecordRemovePlan(source: Record<string, unknown>, sourceKeys: ReadonlyArray<string>, plan: RootRecordRemovePatchPlan): Record<string, unknown> {
  if (plan.strategy === "clear") return {};
  if (plan.strategy === "copyPrefix") return copyRootRecordKeyPrefix(source, sourceKeys, plan.keepCount);
  if (plan.strategy === "copyDelete") {
    const next = copyRootRecordKeys(source, sourceKeys);
    for (const op of plan.operations) delete next[op.key];
    return next;
  }
  const removedKeys = createDataKeySet(plan.operations.map((op) => op.key));
  const next: Record<string, unknown> = {};
  for (const key of sourceKeys) {
    if (objectHasOwn.call(removedKeys, key)) continue;
    writeRootRecordValue(next, key, source[key]);
  }
  return next;
}

export function planRootRecordRemovePatch(ops: ReadonlyArray<JSONPatchOperation>, sourceKeys: ReadonlyArray<string>): RootRecordRemovePatchPlan | null {
  const operations = planRootRecordRemoveOperations(ops, sourceKeys);
  if (operations === null) return null;
  const keepCount = sourceKeys.length - operations.length;
  const removedKeys = createDataKeySet(operations.map((op) => op.key));
  const strategy: RootRecordRemovePatchStrategy = operations.length === sourceKeys.length
    ? "clear"
    : removedRootKeysMatchSuffix(sourceKeys, keepCount, removedKeys)
      ? "copyPrefix"
      : operations.length * 2 < sourceKeys.length
        ? "copyDelete"
        : "rebuild";
  return { operations, strategy, keepCount };
}

export function planRootRecordRemoveOperations(ops: ReadonlyArray<JSONPatchOperation>, sourceKeys: ReadonlyArray<string>): RootRecordRemoveOperationPlan[] | null {
  if (!Array.isArray(ops) || ops.length === 0 || !Array.isArray(sourceKeys)) return null;
  const sourceKeySet = createDataKeySet(sourceKeys);
  const removedKeys = createDataKeySet([]);
  const operations: RootRecordRemoveOperationPlan[] = [];
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (validateOperationShape(op) !== null || op.op !== "remove" || typeof op.path !== "string" || op.path === "" || op.path[0] !== "/" || op.path.includes("~") || op.path.indexOf("/", 1) !== -1) return null;
    const key = op.path.slice(1);
    if (!objectHasOwn.call(sourceKeySet, key) || objectHasOwn.call(removedKeys, key)) return null;
    removedKeys[key] = true;
    operations.push({ op: "remove", path: op.path, key });
  }
  return operations;
}
