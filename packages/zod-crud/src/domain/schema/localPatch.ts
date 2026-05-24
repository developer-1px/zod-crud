import type * as z from "zod";

import {
  applyAcceptedPatch,
  applyTrustedPatch,
  type ApplyResult,
  type JSONPatchOperation,
  type JSONResult,
} from "../../foundation/json-patch/index.js";
import { validateOperationShape } from "../../foundation/json-patch/apply.js";
import {
  buildPointer,
  parentPointer,
  parsePointer,
  readAt,
  type Pointer,
} from "../../foundation/json-pointer/index.js";
import { jsonSerializableError } from "../../foundation/json.js";
import {
  getArrayElement,
  getDef,
  getObjectShape,
  schemaAtPointer,
} from "./introspection.js";

type LocalPatchResult<S extends z.ZodType> = ApplyResult<S> | null;

interface LocalPatchOptions {
  valuesTrusted?: boolean;
}

export interface PlanLocalPatchValueValidationInput {
  path: Pointer;
  schema: z.ZodType;
  value: unknown;
  knownJsonAccepted: boolean;
  valuesTrusted: boolean;
}

export type LocalPatchValueValidationPlan =
  | { kind: "accepted" }
  | { kind: "parse"; path: Pointer; schema: z.ZodType; value: unknown }
  | { kind: "notSerializable"; reason: string };

export interface AppliedValueValidationOperation {
  path: Pointer;
  value: unknown;
}

export interface EvaluateAppliedValueValidationPlanInput<
  S extends z.ZodType,
  Operation extends AppliedValueValidationOperation = AppliedValueValidationOperation,
> {
  state: z.output<S>;
  operations: ReadonlyArray<Operation>;
  schema: z.ZodType;
  knownJsonAccepted: (value: unknown) => boolean;
  valuesTrusted: boolean;
}

export interface PlanIndependentReplacePatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface PlanIndependentReplacePathsInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface PlanSingleReplacePatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface SingleReplacePatchPlan {
  operation: Extract<JSONPatchOperation, { op: "replace" }>;
}

export interface ApplySingleReplaceOperationInput {
  state: unknown;
  operation: Extract<JSONPatchOperation, { op: "replace" }>;
}

export interface SingleReplaceOperationResult {
  state: unknown;
  result: JSONResult;
  applied: ReadonlyArray<JSONPatchOperation>;
}

export interface PlanSingleArrayFieldReplaceInput {
  path: Pointer;
  value: unknown;
}

export interface SingleArrayFieldReplacePlan {
  arrayPath: Pointer;
  index: number;
  key: string;
  value: unknown;
}

export interface ApplySingleArrayFieldReplaceInput {
  state: unknown;
  path: Pointer;
  value: unknown;
}

export interface ApplySingleRootArrayFieldReplaceInput {
  state: unknown;
  arrayPath: Pointer;
  index: number;
  key: string;
  value: unknown;
}

export interface ApplyArrayFieldReplaceAtPointerInput {
  state: unknown;
  arrayPath: Pointer;
  index: number;
  key: string;
  value: unknown;
}

export interface ReadSingleRootArrayFieldTargetInput {
  state: unknown;
  arrayPath: Pointer;
}

export type SingleRootArrayFieldTarget =
  | { kind: "root"; array: unknown[] }
  | { kind: "property"; source: Record<string, unknown>; key: string; array: unknown[] };

export interface PlanSingleRootObjectReplacePatchInput {
  operation: JSONPatchOperation;
  sourceKeys: ReadonlyArray<string>;
}

export interface SingleRootObjectReplacePatchPlan {
  operation: Extract<JSONPatchOperation, { op: "replace" }>;
  key: string;
}

export interface ApplySingleRootObjectReplacePlanInput {
  source: Record<string, unknown>;
  plan: SingleRootObjectReplacePatchPlan;
}

export interface PlanKnownJsonReplacePatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface PlanKnownJsonReplaceOperationsInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface KnownJsonReplacePatchPlan {
  operations: Extract<JSONPatchOperation, { op: "replace" }>[];
}

export interface ApplyKnownJsonReplaceOperationsInput {
  state: unknown;
  operations: ReadonlyArray<Extract<JSONPatchOperation, { op: "replace" }>>;
}

export interface KnownJsonReplaceOperationsResult {
  state: unknown;
  result: JSONResult;
  applied: ReadonlyArray<JSONPatchOperation>;
}

export interface EvaluateKnownJsonReplaceValuesInput {
  schema: z.ZodType;
  operations: ReadonlyArray<Extract<JSONPatchOperation, { op: "replace" }>>;
}

export interface EvaluateAppliedReplaceOperationsInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  operations: ReadonlyArray<JSONPatchOperation>;
  valuesTrusted: boolean;
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

export type AppliedReplaceOperationsValidationResult<S extends z.ZodType> =
  | { ok: true }
  | { ok: false; result: ApplyResult<S> | null };

export interface PlanSequentialPatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type SequentialPatchOperationPlan = Exclude<JSONPatchOperation, { op: "test" }>;

export interface SequentialPatchPlan {
  operations: SequentialPatchOperationPlan[];
}

export type AppliedLocalOpSourceValue = { ok: true; value: unknown } | { ok: false };

export interface ReadAppliedLocalOpSourceValueInput {
  state: unknown;
  operation: JSONPatchOperation;
}

export interface ApplySequentialLocalOperationInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  current: unknown;
  operation: SequentialPatchOperationPlan;
  valuesTrusted: boolean;
}

export interface ApplySequentialLocalOperationPatchInput {
  current: unknown;
  operation: SequentialPatchOperationPlan;
  valuesTrusted: boolean;
}

export interface SequentialLocalOperationPatchResult {
  state: unknown;
  result: JSONResult;
  applied: ReadonlyArray<JSONPatchOperation>;
}

export interface ApplySequentialLocalOperationsInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  operations: ReadonlyArray<SequentialPatchOperationPlan>;
  valuesTrusted: boolean;
}

export type SequentialLocalOperationResult<S extends z.ZodType> =
  | { ok: true; state: unknown; applied: JSONPatchOperation }
  | { ok: false; result: ApplyResult<S> | null };

export type SequentialLocalOperationsResult<S extends z.ZodType> =
  | { ok: true; state: unknown; applied: JSONPatchOperation[] }
  | { ok: false; result: ApplyResult<S> | null };

export interface PlanAppliedLocalOpValidationInput {
  schema: z.ZodType;
  operation: JSONPatchOperation;
  sourceValue: AppliedLocalOpSourceValue;
}

export type AppliedLocalOpValidationPlan =
  | { kind: "parse"; path: Pointer; schema: z.ZodType; value: unknown }
  | { kind: "presence" };

export interface PlanAppendOnlyArrayAddPatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface PlanAppendOnlyArrayAddValuesInput {
  operations: ReadonlyArray<JSONPatchOperation>;
  appendPath: Pointer;
}

export interface AppendOnlyArrayAddPatchPlan {
  parent: Pointer;
  parentSegments: string[];
  values: unknown[];
}

export interface PlanIncreasingArrayAddPatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface PlanIncreasingArrayAddValuesInput {
  operations: ReadonlyArray<JSONPatchOperation>;
  parent: Pointer;
  start: number;
}

export interface PlanArrayAddAppliedOperationsInput {
  parent: Pointer;
  start: number;
  values: ReadonlyArray<unknown>;
}

export interface EvaluateArrayAddElementValuesInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  parent: Pointer;
  operations: ReadonlyArray<AppliedAddValueValidationOperation>;
  valuesTrusted: boolean;
}

export type ArrayAddElementValuesValidationResult<S extends z.ZodType> =
  | { ok: true }
  | { ok: false; result: ApplyResult<S> | null };

export interface ApplyArrayAddPlanInput {
  state: unknown;
  parentSegments: ReadonlyArray<string>;
  array: ReadonlyArray<unknown>;
  start: number;
  values: ReadonlyArray<unknown>;
}

export interface ApplyValidatedArrayAddPlanInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  parent: Pointer;
  parentSegments: ReadonlyArray<string>;
  array: ReadonlyArray<unknown>;
  start: number;
  values: ReadonlyArray<unknown>;
  valuesTrusted: boolean;
}

export interface ReadArrayAtSegmentsInput {
  state: unknown;
  segments: ReadonlyArray<string>;
}

export type ReadArrayAtSegmentsResult =
  | { ok: true; array: ReadonlyArray<unknown> }
  | { ok: false };

export interface AppliedAddValueValidationOperation {
  op: "add";
  path: Pointer;
  value: unknown;
}

export interface AppliedReplaceValueValidationOperation {
  op: "replace";
  path: Pointer;
  value: unknown;
}

export interface IndexedReplaceValueValidationOperation extends AppliedReplaceValueValidationOperation {
  index: number;
}

export interface ArrayIndexReplacement {
  index: number;
  value: unknown;
}

export type ArrayReplacementValueResult =
  | { ok: true; value: unknown }
  | { ok: false };

export interface BuildValidatedArrayIndexReplacementsInput<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
> {
  state: z.output<S>;
  array: ReadonlyArray<unknown>;
  operations: ReadonlyArray<Operation>;
  valueSchema: z.ZodType;
  valuesTrusted: boolean;
  replacementValue: (operation: Operation, currentValue: unknown) => ArrayReplacementValueResult;
}

export type ValidatedArrayIndexReplacementsResult<S extends z.ZodType> =
  | { ok: true; replacements: ArrayIndexReplacement[] }
  | { ok: false; result: ApplyResult<S> | null };

export interface ApplyValidatedArrayIndexReplacementsInput<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
> extends BuildValidatedArrayIndexReplacementsInput<S, Operation> {
  arraySegments: ReadonlyArray<string>;
}

export interface ApplyValidatedArrayFieldReplacementsInput<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
> {
  state: z.output<S>;
  arraySegments: ReadonlyArray<string>;
  array: ReadonlyArray<unknown>;
  field: string;
  operations: ReadonlyArray<Operation>;
  valueSchema: z.ZodType;
  valuesTrusted: boolean;
}

export interface ApplyValidatedArrayFieldReplacementsAtSegmentsInput<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
> {
  state: z.output<S>;
  arraySegments: ReadonlyArray<string>;
  field: string;
  operations: ReadonlyArray<Operation>;
  valueSchema: z.ZodType;
  valuesTrusted: boolean;
}

export interface ApplyValidatedArrayNestedReplacementsInput<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
> extends BuildValidatedArrayIndexReplacementsInput<S, Operation> {
  arraySegments: ReadonlyArray<string>;
  suffixSegments: ReadonlyArray<string>;
}

export interface ApplyValidatedArrayNestedValueReplacementsInput<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
> {
  state: z.output<S>;
  arraySegments: ReadonlyArray<string>;
  array: ReadonlyArray<unknown>;
  suffixSegments: ReadonlyArray<string>;
  operations: ReadonlyArray<Operation>;
  valueSchema: z.ZodType;
  valuesTrusted: boolean;
}

export interface ApplyValidatedArrayNestedValueReplacementsAtSegmentsInput<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
> {
  state: z.output<S>;
  arraySegments: ReadonlyArray<string>;
  suffixSegments: ReadonlyArray<string>;
  operations: ReadonlyArray<Operation>;
  valueSchema: z.ZodType;
  valuesTrusted: boolean;
}

export interface BuildKnownJsonArrayIndexReplacementsInput<
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
> {
  schema: z.ZodType;
  array: ReadonlyArray<unknown>;
  operations: ReadonlyArray<Operation>;
}

export interface ApplyKnownJsonArrayIndexReplacementsInput<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
> extends BuildKnownJsonArrayIndexReplacementsInput<Operation> {
  state: z.output<S>;
  arraySegments: ReadonlyArray<string>;
}

export interface ApplyKnownJsonArrayIndexReplacementsAtSegmentsInput<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
> {
  state: z.output<S>;
  schema: z.ZodType;
  arraySegments: ReadonlyArray<string>;
  operations: ReadonlyArray<Operation>;
}

export interface ApplyArrayIndexReplacementsInput {
  state: unknown;
  arraySegments: ReadonlyArray<string>;
  array: ReadonlyArray<unknown>;
  replacements: ReadonlyArray<ArrayIndexReplacement>;
}

export interface ApplyArrayNestedReplacementsInput {
  state: unknown;
  arraySegments: ReadonlyArray<string>;
  array: ReadonlyArray<unknown>;
  suffixSegments: ReadonlyArray<string>;
  replacements: ReadonlyArray<ArrayIndexReplacement>;
}

export interface AppliedRemoveOperation {
  op: "remove";
  path: Pointer;
}

export interface IncreasingArrayAddPatchPlan {
  parent: Pointer;
  parentSegments: string[];
  start: number;
  values: unknown[];
}

export interface PlanSameArrayPatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface PlanSameArrayPatchOperationsInput {
  operations: ReadonlyArray<JSONPatchOperation>;
  parent: Pointer;
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

export interface PlanRootRecordAddPatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface PlanRootRecordAddOperationsInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface RootRecordAddOperationPlan {
  op: "add";
  path: Pointer;
  key: string;
  value: unknown;
}

export interface RootRecordAddPatchPlan {
  operations: RootRecordAddOperationPlan[];
}

export interface EvaluateRootRecordAddValuesInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  operations: ReadonlyArray<RootRecordAddOperationPlan>;
  valuesTrusted: boolean;
}

export type RootRecordAddValuesValidationResult<S extends z.ZodType> =
  | { ok: true }
  | { ok: false; result: ApplyResult<S> | null };

export interface ApplyRootRecordAddPlanInput {
  source: Record<string, unknown>;
  plan: RootRecordAddPatchPlan;
}

export interface ReadRootRecordForLocalPatchInput {
  state: unknown;
}

export type ReadRootRecordForLocalPatchResult =
  | { ok: true; source: Record<string, unknown>; sourceKeys: string[] }
  | { ok: false };

export interface PlanRootRecordRemovePatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
  sourceKeys: ReadonlyArray<string>;
}

export interface PlanRootRecordRemoveOperationsInput {
  operations: ReadonlyArray<JSONPatchOperation>;
  sourceKeys: ReadonlyArray<string>;
}

export type RootRecordRemovePatchStrategy = "clear" | "copyPrefix" | "copyDelete" | "rebuild";

export interface PlanRootRecordRemoveStrategyInput {
  sourceKeys: ReadonlyArray<string>;
  operations: ReadonlyArray<RootRecordRemoveOperationPlan>;
}

export interface RootRecordRemoveStrategyPlan {
  strategy: RootRecordRemovePatchStrategy;
  keepCount: number;
}

export interface RootRecordRemoveOperationPlan {
  op: "remove";
  path: Pointer;
  key: string;
}

export interface RootRecordRemovePatchPlan {
  operations: RootRecordRemoveOperationPlan[];
  strategy: RootRecordRemovePatchStrategy;
  keepCount: number;
}

export interface ApplyRootRecordRemovePlanInput {
  source: Record<string, unknown>;
  sourceKeys: ReadonlyArray<string>;
  plan: RootRecordRemovePatchPlan;
}

export interface PlanRootObjectReplacePatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
  sourceKeys: ReadonlyArray<string>;
}

export interface PlanRootObjectReplaceOperationsInput {
  operations: ReadonlyArray<JSONPatchOperation>;
  sourceKeys: ReadonlyArray<string>;
}

export type RootObjectReplacePatchStrategy = "orderedReplace" | "copyWrite";

export interface RootObjectReplaceOperationPlan {
  op: "replace";
  path: Pointer;
  key: string;
  value: unknown;
}

export interface RootObjectReplacePatchPlan {
  operations: RootObjectReplaceOperationPlan[];
  strategy: RootObjectReplacePatchStrategy;
}

export interface PlanRootObjectReplaceStrategyInput {
  operations: ReadonlyArray<RootObjectReplaceOperationPlan>;
  sourceKeys: ReadonlyArray<string>;
}

export type RootObjectReplaceValueSource =
  | { kind: "object"; shape: Record<string, z.ZodType | undefined> }
  | { kind: "record"; schema: z.ZodType; acceptsKnownJson: (value: unknown) => boolean };

export interface EvaluateRootObjectReplaceValuesInput<S extends z.ZodType> {
  state: z.output<S>;
  operations: ReadonlyArray<RootObjectReplaceOperationPlan>;
  source: RootObjectReplaceValueSource;
  valuesTrusted: boolean;
}

export type RootObjectReplaceValuesValidationResult<S extends z.ZodType> =
  | { ok: true }
  | { ok: false; result: ApplyResult<S> | null };

export interface ApplyRootObjectReplacePlanInput {
  source: Record<string, unknown>;
  sourceKeys: ReadonlyArray<string>;
  plan: RootObjectReplacePatchPlan;
}

export interface PlanSameArrayFieldReplacePatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface ArrayFieldText {
  prefixText: string;
  suffixText: string;
}

export interface PlanSameArrayFieldReplaceOperationsInput {
  operations: ReadonlyArray<JSONPatchOperation>;
  arrayPath: Pointer;
  field: string;
  fieldText: ArrayFieldText;
}

export interface SameArrayFieldReplaceOperationPlan {
  op: "replace";
  path: Pointer;
  index: number;
  value: unknown;
}

export interface SameArrayFieldReplacePatchPlan {
  arrayPath: Pointer;
  arraySegments: string[];
  field: string;
  operations: SameArrayFieldReplaceOperationPlan[];
}

export interface PlanSameArrayElementReplacePatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface PlanSameArrayElementReplaceOperationsInput {
  operations: ReadonlyArray<JSONPatchOperation>;
  parent: Pointer;
}

export interface SameArrayElementReplaceOperationPlan {
  op: "replace";
  path: Pointer;
  index: number;
  value: unknown;
}

export interface SameArrayElementReplacePatchPlan {
  parent: Pointer;
  parentSegments: string[];
  operations: SameArrayElementReplaceOperationPlan[];
}

export interface PlanSameArrayNestedReplacePatchInput {
  state: unknown;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface PlanSameArrayNestedReplaceOperationsInput {
  operations: ReadonlyArray<JSONPatchOperation>;
  arrayPath: Pointer;
  suffixSegments: string[];
  prefixText: string;
  suffixText: string;
}

export interface SameArrayNestedReplaceOperationPlan {
  op: "replace";
  path: Pointer;
  index: number;
  value: unknown;
}

export interface SameArrayNestedReplacePatchPlan {
  arrayPath: Pointer;
  arraySegments: string[];
  suffixSegments: string[];
  operations: SameArrayNestedReplaceOperationPlan[];
}

interface ExtendedDef {
  type?: string;
  coerce?: boolean;
  checks?: unknown[];
  innerType?: z.ZodType;
  catchall?: z.ZodType;
  keyType?: z.ZodType;
  valueType?: z.ZodType;
  options?: z.ZodType[];
  items?: z.ZodType[];
  rest?: z.ZodType | null;
  getter?: () => z.ZodType;
  in?: z.ZodType;
  out?: z.ZodType;
  left?: z.ZodType;
  right?: z.ZodType;
  values?: unknown[];
  entries?: Record<string, unknown>;
}

interface LocalSchemaCache {
  pointerSchemas: Map<string, z.ZodType | null>;
}

type KnownJsonValueValidator = (value: unknown, seen: WeakSet<object>) => boolean;

interface ArrayFieldPath {
  arrayPath: Pointer;
  index: number;
  key: string;
}

interface ArrayNestedPath {
  arrayPath: Pointer;
  arraySegments: string[];
  index: number;
  prefixText: string;
  suffixText: string;
  suffixSegments: string[];
}

const objectHasOwn = Object.prototype.hasOwnProperty;
const plainStructuralSchemaCache = new WeakMap<object, boolean>();
const knownJsonOutputSchemaCache = new WeakMap<object, boolean>();
const localSchemaCaches = new WeakMap<object, LocalSchemaCache>();
const knownJsonValueValidatorCache = new WeakMap<object, KnownJsonValueValidator | null>();
const primitiveJsonValueSeen = new WeakSet<object>();

function copyRootRecord(source: Record<string, unknown>): Record<string, unknown> {
  return copyRootRecordKeys(source, Object.keys(source));
}

function copyRootRecordKeys(
  source: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): Record<string, unknown> {
  return copyRootRecordKeyPrefix(source, keys, keys.length);
}

export function copyRootRecordKeyPrefix(
  source: Record<string, unknown>,
  keys: ReadonlyArray<string>,
  end: number,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (let index = 0; index < end; index += 1) {
    const key = keys[index]!;
    writeObjectDataValue(next, key, source[key]);
  }
  return next;
}

export function writeRootRecordValue(target: Record<string, unknown>, key: string, value: unknown): void {
  writeObjectDataValue(target, key, value);
}

export function writeObjectDataValue(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === "__proto__") {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  } else {
    target[key] = value;
  }
}

export function replaceObjectDataValue(current: unknown, key: string, value: unknown): Record<string, unknown> | null {
  if (current === null || typeof current !== "object" || Array.isArray(current)) return null;
  if (!objectHasOwn.call(current, key)) return null;

  const next = { ...(current as Record<string, unknown>) };
  writeObjectDataValue(next, key, value);
  return next;
}

export function createDataKeySet(keys: ReadonlyArray<string>): Record<string, true> {
  const keySet = Object.create(null) as Record<string, true>;
  for (const key of keys) {
    keySet[key] = true;
  }
  return keySet;
}

function removedRootKeysMatchSuffix(
  keys: ReadonlyArray<string>,
  keepCount: number,
  removedKeys: Record<string, true>,
): boolean {
  for (let index = keepCount; index < keys.length; index += 1) {
    if (!objectHasOwn.call(removedKeys, keys[index]!)) return false;
  }
  return true;
}

export function applyPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  options: LocalPatchOptions = {},
): LocalPatchResult<S> {
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
  if (planIndependentReplacePatch({ operations: ops })) {
    return applyReplacePatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  }
  const appendOnlyAdd = applyAppendOnlyAddPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (appendOnlyAdd) return appendOnlyAdd;
  const increasingAdd = applyIncreasingArrayAddPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (increasingAdd) return increasingAdd;
  const arrayBatch = applySameArrayPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (arrayBatch) return arrayBatch;
  return applySequentialPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
}

export function isPlainStructuralSchemaForLocalValidation(schema: z.ZodType): boolean {
  return isPlainStructuralSchema(schema);
}

export function schemaOutputIsKnownJson(schema: z.ZodType): boolean {
  return schemaOutputIsKnownJsonInternal(schema);
}

function applyReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  const acceptedValues = valuesTrusted
    ? null
    : applyKnownJsonReplacePatchWithLocalSchemaValidation(schema, state, ops);
  if (acceptedValues) return acceptedValues;

  const applied = applyReplaceOperations({ state, operations: ops, valuesTrusted });
  if (!applied.result.ok) {
    return failedLocalPatch(state, applied.result);
  }

  const validation = evaluateAppliedReplaceOperations({
    schema,
    state,
    operations: applied.applied,
    valuesTrusted,
  });
  if (!validation.ok) return validation.result;

  return okLocalPatch(applied.state as z.output<S>, applied.applied);
}

export function applyReplaceOperations(input: ApplyReplaceOperationsInput): ReplaceOperationsResult {
  const applied = input.valuesTrusted
    ? applyAcceptedPatch(input.state, input.operations)
    : applyTrustedPatch(input.state, input.operations);
  return applied.result.ok
    ? { state: applied.state, result: applied.result, applied: applied.applied }
    : { state: input.state, result: applied.result, applied: [] };
}

export function evaluateAppliedReplaceOperations<S extends z.ZodType>(
  input: EvaluateAppliedReplaceOperationsInput<S>,
): AppliedReplaceOperationsValidationResult<S> {
  const { schema, state, operations, valuesTrusted } = input;
  for (const op of operations) {
    if (op.op !== "replace") return { ok: false, result: null };
    const valueSchema = cachedSchemaAtPointer(schema, op.path, "value");
    if (!valueSchema) return { ok: false, result: null };
    const valueValidation = planLocalPatchValueValidation({
      path: op.path,
      schema: valueSchema,
      value: op.value,
      knownJsonAccepted: acceptsKnownJsonValue(valueSchema, op.value),
      valuesTrusted,
    });
    const valueFailure = evaluateLocalPatchValueValidationPlan(state, valueValidation);
    if (valueFailure) return { ok: false, result: valueFailure };
  }
  return { ok: true };
}

function applySingleReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  const plan = planSingleReplacePatch({ operations: ops });
  if (plan === null) return null;
  const op = plan.operation;

  const valueValidation = evaluateAppliedReplaceOperations({
    schema,
    state,
    operations: [op],
    valuesTrusted,
  });
  if (!valueValidation.ok) return valueValidation.result;

  const applied = applySingleReplaceOperation({ state, operation: op });
  return applied.result.ok
    ? okLocalPatch(applied.state as z.output<S>, applied.applied)
    : failedLocalPatch(state, applied.result);
}

export function applySingleReplaceOperation(input: ApplySingleReplaceOperationInput): SingleReplaceOperationResult {
  const { state, operation } = input;
  const singleArrayFieldReplace = applySingleArrayFieldReplacePatchWithLocalSchemaValidation(state, operation);
  if (singleArrayFieldReplace !== null) {
    return { state: singleArrayFieldReplace, result: { ok: true }, applied: [operation] };
  }

  const singleRootReplace = applySingleRootObjectReplacePatchWithLocalSchemaValidation(state, operation);
  if (singleRootReplace !== null) {
    return { state: singleRootReplace, result: { ok: true }, applied: [operation] };
  }

  const applied = applyAcceptedPatch(state, [operation]);
  return applied.result.ok
    ? { state: applied.state, result: applied.result, applied: applied.applied }
    : { state, result: applied.result, applied: [] };
}

export function planLocalPatchValueValidation(
  input: PlanLocalPatchValueValidationInput,
): LocalPatchValueValidationPlan {
  if (input.knownJsonAccepted) return { kind: "accepted" };
  if (!input.valuesTrusted) {
    const jsonError = jsonSerializableError(input.value);
    if (jsonError !== null) return { kind: "notSerializable", reason: jsonError };
  }
  return { kind: "parse", path: input.path, schema: input.schema, value: input.value };
}

export function evaluateLocalPatchValueValidationPlan<S extends z.ZodType>(
  state: z.output<S>,
  plan: LocalPatchValueValidationPlan,
): ApplyResult<S> | null {
  if (plan.kind === "notSerializable") {
    return operationFailure(state, "not_serializable", plan.reason);
  }
  if (plan.kind === "parse") {
    const result = plan.schema.safeParse(plan.value);
    if (!result.success) return schemaViolation(state, plan.path, result.error.issues);
  }
  return null;
}

export function planArrayAddAppliedOperations(
  input: PlanArrayAddAppliedOperationsInput,
): AppliedAddValueValidationOperation[] {
  const applied = new Array<AppliedAddValueValidationOperation>(input.values.length);
  for (let index = 0; index < input.values.length; index += 1) {
    applied[index] = {
      op: "add",
      path: appendArrayIndexPath(input.parent, input.start + index),
      value: input.values[index],
    };
  }
  return applied;
}

export function toAppliedAddOperations(
  operations: ReadonlyArray<AppliedAddValueValidationOperation>,
): Extract<JSONPatchOperation, { op: "add" }>[] {
  return operations.map((op) => ({ op: "add", path: op.path, value: op.value }));
}

export function toAppliedReplaceOperations(
  operations: ReadonlyArray<AppliedReplaceValueValidationOperation>,
): Extract<JSONPatchOperation, { op: "replace" }>[] {
  return operations.map((op) => ({ op: "replace", path: op.path, value: op.value }));
}

export function toAppliedRemoveOperations(
  operations: ReadonlyArray<AppliedRemoveOperation>,
): Extract<JSONPatchOperation, { op: "remove" }>[] {
  return operations.map((op) => ({ op: "remove", path: op.path }));
}

export function evaluateAppliedAddValueValidationPlan<S extends z.ZodType>(
  state: z.output<S>,
  operations: ReadonlyArray<AppliedAddValueValidationOperation>,
  schema: z.ZodType,
  knownJsonAccepted: (value: unknown) => boolean,
  valuesTrusted: boolean,
): ApplyResult<S> | null {
  return evaluateAppliedValueValidationPlan({
    state,
    operations,
    schema,
    knownJsonAccepted,
    valuesTrusted,
  });
}

export function evaluateAppliedValueValidationPlan<
  S extends z.ZodType,
  Operation extends AppliedValueValidationOperation = AppliedValueValidationOperation,
>(
  input: EvaluateAppliedValueValidationPlanInput<S, Operation>,
): ApplyResult<S> | null {
  const { state, operations, schema, knownJsonAccepted, valuesTrusted } = input;
  for (const op of operations) {
    const valueValidation = planLocalPatchValueValidation({
      path: op.path,
      schema,
      value: op.value,
      knownJsonAccepted: knownJsonAccepted(op.value),
      valuesTrusted,
    });
    const valueFailure = evaluateLocalPatchValueValidationPlan(state, valueValidation);
    if (valueFailure) return valueFailure;
  }
  return null;
}

export function evaluateAppliedReplaceValueValidationPlan<S extends z.ZodType>(
  state: z.output<S>,
  operations: ReadonlyArray<AppliedReplaceValueValidationOperation>,
  schema: z.ZodType,
  knownJsonAccepted: (value: unknown) => boolean,
  valuesTrusted: boolean,
): ApplyResult<S> | null {
  return evaluateAppliedValueValidationPlan({
    state,
    operations,
    schema,
    knownJsonAccepted,
    valuesTrusted,
  });
}

export function planSingleReplacePatch(input: PlanSingleReplacePatchInput): SingleReplacePatchPlan | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length !== 1 || !(0 in ops)) return null;
  const op = ops[0]!;
  if (
    validateOperationShape(op) !== null
    || op.op !== "replace"
    || typeof op.path !== "string"
    || op.path === ""
  ) {
    return null;
  }

  return { operation: op };
}

function applySingleArrayFieldReplacePatchWithLocalSchemaValidation(
  state: unknown,
  op: Extract<JSONPatchOperation, { op: "replace" }>,
): unknown | null {
  return applySingleArrayFieldReplace({ state, path: op.path, value: op.value });
}

export function applySingleArrayFieldReplace(input: ApplySingleArrayFieldReplaceInput): unknown | null {
  const { state, path, value } = input;
  const plan = planSingleArrayFieldReplace({ path, value });
  if (plan === null) return null;

  const rootArrayReplace = applySingleRootArrayFieldReplace({
    state,
    arrayPath: plan.arrayPath,
    index: plan.index,
    key: plan.key,
    value: plan.value,
  });
  if (rootArrayReplace !== null) return rootArrayReplace;

  return applyArrayFieldReplaceAtPointer({
    state,
    arrayPath: plan.arrayPath,
    index: plan.index,
    key: plan.key,
    value: plan.value,
  });
}

export function applyArrayFieldReplaceAtPointer(input: ApplyArrayFieldReplaceAtPointerInput): unknown | null {
  const { state, arrayPath, index, key, value } = input;
  let arraySegments: string[];
  try {
    arraySegments = parsePointer(arrayPath);
  } catch {
    return null;
  }

  const current = readArrayAtSegments({ state, segments: arraySegments });
  if (!current.ok) return null;

  const nextArray = replaceArrayField(current.array, index, key, value);
  return nextArray === null ? null : replaceValueAtSegments(state, arraySegments, 0, nextArray);
}

export function planSingleArrayFieldReplace(
  input: PlanSingleArrayFieldReplaceInput,
): SingleArrayFieldReplacePlan | null {
  const location = parseArrayFieldPath(input.path);
  return location === null
    ? null
    : { ...location, value: input.value };
}

export function readSingleRootArrayFieldTarget(
  input: ReadSingleRootArrayFieldTargetInput,
): SingleRootArrayFieldTarget | null {
  const { state, arrayPath } = input;
  if (arrayPath === "") {
    return Array.isArray(state) ? { kind: "root", array: state } : null;
  }

  if (
    arrayPath[0] !== "/"
    || arrayPath.includes("~")
    || arrayPath.indexOf("/", 1) !== -1
  ) {
    return null;
  }

  const arrayKey = arrayPath.slice(1);
  if (arrayKey === "__proto__") return null;

  const root = readRootRecordForLocalPatch({ state });
  if (!root.ok || !objectHasOwn.call(root.source, arrayKey)) return null;

  const current = root.source[arrayKey];
  return Array.isArray(current)
    ? { kind: "property", source: root.source, key: arrayKey, array: current }
    : null;
}

export function applySingleRootArrayFieldReplace(input: ApplySingleRootArrayFieldReplaceInput): unknown | null {
  const { state, arrayPath, index, key, value } = input;
  const target = readSingleRootArrayFieldTarget({ state, arrayPath });
  if (target === null) return null;

  const nextArray = replaceArrayField(target.array, index, key, value);
  if (nextArray === null) return null;
  return target.kind === "root" ? nextArray : { ...target.source, [target.key]: nextArray };
}

export function replaceArrayField(
  array: ReadonlyArray<unknown>,
  index: number,
  key: string,
  value: unknown,
): unknown[] | null {
  if (index < 0 || index >= array.length) return null;
  const replaced = replaceObjectDataValue(array[index], key, value);
  if (replaced === null) return null;

  const next = array.slice();
  next[index] = replaced;
  return next;
}

function applySingleRootObjectReplacePatchWithLocalSchemaValidation(
  state: unknown,
  op: Extract<JSONPatchOperation, { op: "replace" }>,
): unknown | null {
  const root = readRootRecordForLocalPatch({ state });
  if (!root.ok) return null;
  const plan = planSingleRootObjectReplacePatch({
    operation: op,
    sourceKeys: root.sourceKeys,
  });
  if (plan === null) return null;

  return applySingleRootObjectReplacePlan({ source: root.source, plan });
}

export function applySingleRootObjectReplacePlan(input: ApplySingleRootObjectReplacePlanInput): Record<string, unknown> {
  const { source, plan } = input;
  const next = copyRootRecord(source);
  writeRootRecordValue(next, plan.key, plan.operation.value);
  return next;
}

export function planSingleRootObjectReplacePatch(
  input: PlanSingleRootObjectReplacePatchInput,
): SingleRootObjectReplacePatchPlan | null {
  const op = input.operation;
  const sourceKeys = input.sourceKeys;
  if (
    !Array.isArray(sourceKeys)
    || validateOperationShape(op) !== null
    || op.op !== "replace"
    || typeof op.path !== "string"
    || op.path[0] !== "/"
    || op.path.includes("~")
    || op.path.indexOf("/", 1) !== -1
  ) {
    return null;
  }

  const key = op.path.slice(1);
  if (key === "") return null;
  for (const sourceKey of sourceKeys) {
    if (sourceKey === key) return { operation: op, key };
  }
  return null;
}

function applyKnownJsonReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): LocalPatchResult<S> {
  const plan = planKnownJsonReplacePatch({ operations: ops });
  if (plan === null) return null;

  const sameArrayElementReplace = applyKnownJsonSameArrayElementReplacePatchWithLocalSchemaValidation(schema, state, ops);
  if (sameArrayElementReplace) return sameArrayElementReplace;

  if (!evaluateKnownJsonReplaceValues({ schema, operations: plan.operations })) return null;

  const applied = applyKnownJsonReplaceOperations({ state, operations: plan.operations });
  if (!applied.result.ok) {
    return failedLocalPatch(state, applied.result);
  }
  return okLocalPatch(applied.state as z.output<S>, applied.applied);
}

export function planKnownJsonReplacePatch(input: PlanKnownJsonReplacePatchInput): KnownJsonReplacePatchPlan | null {
  const operations = planKnownJsonReplaceOperations(input);
  return operations === null ? null : { operations };
}

export function planKnownJsonReplaceOperations(
  input: PlanKnownJsonReplaceOperationsInput,
): Extract<JSONPatchOperation, { op: "replace" }>[] | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length === 0) return null;

  const operations = new Array<Extract<JSONPatchOperation, { op: "replace" }>>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (!isReplacePatchOperationCandidate(op)) return null;
    operations[index] = op;
  }

  return operations;
}

export function applyKnownJsonReplaceOperations(
  input: ApplyKnownJsonReplaceOperationsInput,
): KnownJsonReplaceOperationsResult {
  const applied = applyAcceptedPatch(input.state, input.operations);
  return applied.result.ok
    ? { state: applied.state, result: applied.result, applied: applied.applied }
    : { state: input.state, result: applied.result, applied: [] };
}

export function evaluateKnownJsonReplaceValues(input: EvaluateKnownJsonReplaceValuesInput): boolean {
  const { schema, operations } = input;
  for (const op of operations) {
    const valueSchema = cachedSchemaAtPointer(schema, op.path, "value");
    if (!valueSchema || !acceptsKnownJsonValue(valueSchema, op.value)) return false;
  }
  return true;
}

function applyKnownJsonSameArrayElementReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): LocalPatchResult<S> {
  const plan = planSameArrayElementReplacePatch({ operations: ops });
  if (plan === null) return null;

  const elementSchema = arrayElementSchemaAtParent(schema, plan.parent);
  if (!elementSchema) return null;

  return applyKnownJsonArrayIndexReplacementsAtSegments({
    state,
    schema: elementSchema,
    arraySegments: plan.parentSegments,
    operations: plan.operations,
  });
}

export function planSameArrayElementReplacePatch(
  input: PlanSameArrayElementReplacePatchInput,
): SameArrayElementReplacePatchPlan | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length === 0) return null;

  if (!(0 in ops)) return null;
  const first = ops[0]!;
  if (!isReplacePatchOperationCandidate(first)) return null;

  const firstLocation = arrayElementReplaceLocation(first.path);
  if (firstLocation === null) return null;

  const operations = planSameArrayElementReplaceOperations({
    operations: ops,
    parent: firstLocation.parent,
  });
  return operations === null
    ? null
    : { parent: firstLocation.parent, parentSegments: firstLocation.parentSegments, operations };
}

export function planSameArrayElementReplaceOperations(
  input: PlanSameArrayElementReplaceOperationsInput,
): SameArrayElementReplaceOperationPlan[] | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length === 0) return null;

  const parentIndexPrefix = arrayElementIndexPrefix(input.parent);
  const operations = new Array<SameArrayElementReplaceOperationPlan>(ops.length);

  for (let opIndex = 0; opIndex < ops.length; opIndex += 1) {
    if (!(opIndex in ops)) return null;
    const op = ops[opIndex]!;
    if (!isReplacePatchOperationCandidate(op)) return null;

    const index = parseKnownArrayElementReplaceIndex(op.path, parentIndexPrefix);
    if (index === null) return null;
    operations[opIndex] = { op: "replace", path: op.path, index, value: op.value };
  }

  return operations;
}

function isReplacePatchOperationCandidate(
  op: JSONPatchOperation,
): op is Extract<JSONPatchOperation, { op: "replace" }> {
  return !!op
    && typeof op === "object"
    && validateOperationShape(op) === null
    && op.op === "replace"
    && typeof op.path === "string";
}

function applySameArrayFieldReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  const plan = planSameArrayFieldReplacePatch({ operations: ops });
  if (plan === null) return null;
  const first = plan.operations[0];
  if (first === undefined) return null;
  const valueSchema = cachedSchemaAtPointer(schema, first.path, "value");
  if (!valueSchema) return null;

  return applyValidatedArrayFieldReplacementsAtSegments({
    state,
    arraySegments: plan.arraySegments,
    operations: plan.operations,
    field: plan.field,
    valueSchema,
    valuesTrusted,
  });
}

export function planSameArrayFieldReplacePatch(
  input: PlanSameArrayFieldReplacePatchInput,
): SameArrayFieldReplacePatchPlan | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length < 2) return null;

  if (!(0 in ops)) return null;
  const first = ops[0]!;
  if (!isReplacePatchOperationCandidate(first) || first.path === "") return null;

  const firstLocation = parseArrayFieldPath(first.path);
  if (firstLocation === null) return null;

  let arraySegments: string[];
  try {
    arraySegments = parsePointer(firstLocation.arrayPath);
  } catch {
    return null;
  }

  const fieldText = arrayFieldText(first.path);
  if (fieldText === null) return null;

  const operations = planSameArrayFieldReplaceOperations({
    operations: ops,
    arrayPath: firstLocation.arrayPath,
    field: firstLocation.key,
    fieldText,
  });
  return operations === null
    ? null
    : { arrayPath: firstLocation.arrayPath, arraySegments, field: firstLocation.key, operations };
}

export function planSameArrayFieldReplaceOperations(
  input: PlanSameArrayFieldReplaceOperationsInput,
): SameArrayFieldReplaceOperationPlan[] | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length < 2) return null;

  const operations = new Array<SameArrayFieldReplaceOperationPlan>(ops.length);

  for (let opIndex = 0; opIndex < ops.length; opIndex += 1) {
    if (!(opIndex in ops)) return null;
    const op = ops[opIndex]!;
    if (!isReplacePatchOperationCandidate(op) || op.path === "") return null;

    const knownIndex = parseKnownArrayFieldIndex(op.path, input.fieldText);
    const location = knownIndex === null
      ? parseArrayFieldPath(op.path)
      : { arrayPath: input.arrayPath, index: knownIndex, key: input.field };
    if (location === null || location.arrayPath !== input.arrayPath || location.key !== input.field) return null;

    operations[opIndex] = { op: "replace", path: op.path, index: location.index, value: op.value };
  }

  return operations;
}

function applySameArrayNestedReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  const plan = planSameArrayNestedReplacePatch({ state, operations: ops });
  if (plan === null) return null;
  const first = plan.operations[0];
  if (first === undefined) return null;
  const valueSchema = cachedSchemaAtPointer(schema, first.path, "value");
  if (!valueSchema) return null;

  return applyValidatedArrayNestedValueReplacementsAtSegments({
    state,
    arraySegments: plan.arraySegments,
    suffixSegments: plan.suffixSegments,
    operations: plan.operations,
    valueSchema,
    valuesTrusted,
  });
}

export function planSameArrayNestedReplacePatch(
  input: PlanSameArrayNestedReplacePatchInput,
): SameArrayNestedReplacePatchPlan | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length < 2) return null;

  if (!(0 in ops)) return null;
  const first = ops[0]!;
  if (!isReplacePatchOperationCandidate(first) || first.path === "") return null;

  const firstLocation = parseFirstArrayNestedPath(input.state, first.path);
  if (firstLocation === null) return null;

  const operations = planSameArrayNestedReplaceOperations({
    operations: ops,
    arrayPath: firstLocation.arrayPath,
    suffixSegments: firstLocation.suffixSegments,
    prefixText: firstLocation.prefixText,
    suffixText: firstLocation.suffixText,
  });
  return operations === null
    ? null
    : {
        arrayPath: firstLocation.arrayPath,
        arraySegments: firstLocation.arraySegments,
        suffixSegments: firstLocation.suffixSegments,
        operations,
      };
}

export function planSameArrayNestedReplaceOperations(
  input: PlanSameArrayNestedReplaceOperationsInput,
): SameArrayNestedReplaceOperationPlan[] | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length < 2) return null;

  const operations = new Array<SameArrayNestedReplaceOperationPlan>(ops.length);

  for (let opIndex = 0; opIndex < ops.length; opIndex += 1) {
    if (!(opIndex in ops)) return null;
    const op = ops[opIndex]!;
    if (!isReplacePatchOperationCandidate(op) || op.path === "") return null;

    const index = parseKnownArrayNestedIndex(
      op.path,
      input.arrayPath,
      input.suffixSegments,
      input.prefixText,
      input.suffixText,
    );
    if (index === null) return null;
    operations[opIndex] = { op: "replace", path: op.path, index, value: op.value };
  }

  return operations;
}

function applyRootObjectReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  if (!Array.isArray(ops) || ops.length < 2) return null;
  const root = readRootRecordForLocalPatch({ state });
  if (!root.ok) return null;

  const plan = planRootObjectReplacePatch({ operations: ops, sourceKeys: root.sourceKeys });
  if (plan === null) return null;

  const valueSource = rootObjectReplaceValueSourceForLocalPatch(schema);
  if (valueSource === null) return null;

  const valueValidation = evaluateRootObjectReplaceValues({
    state,
    operations: plan.operations,
    source: valueSource,
    valuesTrusted,
  });
  if (!valueValidation.ok) return valueValidation.result;

  const resultState = applyRootObjectReplacePlan({ source: root.source, sourceKeys: root.sourceKeys, plan });

  return okLocalPatch(resultState as z.output<S>, toAppliedReplaceOperations(plan.operations));
}

export function rootObjectReplaceValueSourceForLocalPatch(
  schema: z.ZodType,
): RootObjectReplaceValueSource | null {
  const shape = getObjectShape(schema);
  if (shape !== null) return { kind: "object", shape };

  const rootDef = getDef(schema) as ExtendedDef;
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
  input: EvaluateRootObjectReplaceValuesInput<S>,
): RootObjectReplaceValuesValidationResult<S> {
  const { state, operations, source, valuesTrusted } = input;
  for (const op of operations) {
    const valueSchema = rootObjectReplaceValueSchema(source, op.key);
    if (valueSchema === null) return { ok: false, result: null };
    const valueValidation = planLocalPatchValueValidation({
      path: op.path,
      schema: valueSchema,
      value: op.value,
      knownJsonAccepted: rootObjectReplaceValueAccepted(source, valueSchema, op.value),
      valuesTrusted,
    });
    const valueFailure = evaluateLocalPatchValueValidationPlan(state, valueValidation);
    if (valueFailure) return { ok: false, result: valueFailure };
  }
  return { ok: true };
}

function rootObjectReplaceValueSchema(
  source: RootObjectReplaceValueSource,
  key: string,
): z.ZodType | null {
  if (source.kind === "record") return source.schema;
  return objectHasOwn.call(source.shape, key) ? (source.shape[key] ?? null) : null;
}

function rootObjectReplaceValueAccepted(
  source: RootObjectReplaceValueSource,
  schema: z.ZodType,
  value: unknown,
): boolean {
  return source.kind === "record"
    ? source.acceptsKnownJson(value)
    : acceptsKnownJsonValue(schema, value);
}

export function applyRootObjectReplacePlan(input: ApplyRootObjectReplacePlanInput): Record<string, unknown> {
  const { source, sourceKeys, plan } = input;
  const next = plan.strategy === "orderedReplace"
    ? {}
    : copyRootRecordKeys(source, sourceKeys);
  for (const op of plan.operations) {
    writeRootRecordValue(next, op.key, op.value);
  }
  return next;
}

export function planRootObjectReplacePatch(
  input: PlanRootObjectReplacePatchInput,
): RootObjectReplacePatchPlan | null {
  const operations = planRootObjectReplaceOperations(input);
  if (operations === null) return null;
  return {
    operations,
    strategy: planRootObjectReplaceStrategy({ operations, sourceKeys: input.sourceKeys }),
  };
}

export function planRootObjectReplaceOperations(
  input: PlanRootObjectReplaceOperationsInput,
): RootObjectReplaceOperationPlan[] | null {
  const ops = input.operations;
  const sourceKeys = input.sourceKeys;
  if (!Array.isArray(ops) || ops.length < 2 || !Array.isArray(sourceKeys)) return null;

  const sourceKeySet = createDataKeySet(sourceKeys);

  const operations: RootObjectReplaceOperationPlan[] = [];
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "replace"
      || typeof op.path !== "string"
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return null;
    }

    const key = op.path.slice(1);
    if (key === "" || !objectHasOwn.call(sourceKeySet, key)) return null;
    operations.push({ op: "replace", path: op.path, key, value: op.value });
  }

  return operations;
}

export function planRootObjectReplaceStrategy(
  input: PlanRootObjectReplaceStrategyInput,
): RootObjectReplacePatchStrategy {
  const { operations, sourceKeys } = input;
  if (operations.length !== sourceKeys.length) return "copyWrite";
  for (let index = 0; index < operations.length; index += 1) {
    if (operations[index]!.key !== sourceKeys[index]) return "copyWrite";
  }
  return "orderedReplace";
}

function applyRootRecordRemovePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): LocalPatchResult<S> {
  if (!Array.isArray(ops) || ops.length === 0) return null;
  const root = readRootRecordForLocalPatch({ state });
  if (!root.ok) return null;

  if (rootRecordValueSchemaForLocalPatch(schema) === null) return null;

  const plan = planRootRecordRemovePatch({ operations: ops, sourceKeys: root.sourceKeys });
  if (plan === null) return null;
  const applied = toAppliedRemoveOperations(plan.operations);
  const next = applyRootRecordRemovePlan({ source: root.source, sourceKeys: root.sourceKeys, plan });

  return okLocalPatch(next as z.output<S>, applied);
}

export function applyRootRecordRemovePlan(input: ApplyRootRecordRemovePlanInput): Record<string, unknown> {
  const { source, sourceKeys, plan } = input;

  if (plan.strategy === "clear") return {};
  if (plan.strategy === "copyPrefix") return copyRootRecordKeyPrefix(source, sourceKeys, plan.keepCount);
  if (plan.strategy === "copyDelete") {
    const next = copyRootRecordKeys(source, sourceKeys);
    for (const op of plan.operations) {
      delete next[op.key];
    }
    return next;
  }

  const removedKeys = rootRecordRemoveKeySet(plan.operations);
  const next: Record<string, unknown> = {};
  for (const key of sourceKeys) {
    if (objectHasOwn.call(removedKeys, key)) continue;
    writeRootRecordValue(next, key, source[key]);
  }

  return next;
}

export function planRootRecordRemovePatch(
  input: PlanRootRecordRemovePatchInput,
): RootRecordRemovePatchPlan | null {
  const operations = planRootRecordRemoveOperations(input);
  if (operations === null) return null;
  const { sourceKeys } = input;
  const { strategy, keepCount } = planRootRecordRemoveStrategy({ sourceKeys, operations });
  return { operations, strategy, keepCount };
}

export function planRootRecordRemoveOperations(
  input: PlanRootRecordRemoveOperationsInput,
): RootRecordRemoveOperationPlan[] | null {
  const ops = input.operations;
  const sourceKeys = input.sourceKeys;
  if (!Array.isArray(ops) || ops.length === 0 || !Array.isArray(sourceKeys)) return null;

  const sourceKeySet = createDataKeySet(sourceKeys);

  const removedKeys = createDataKeySet([]);
  const operations: RootRecordRemoveOperationPlan[] = [];
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "remove"
      || typeof op.path !== "string"
      || op.path === ""
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return null;
    }

    const key = op.path.slice(1);
    if (!objectHasOwn.call(sourceKeySet, key) || objectHasOwn.call(removedKeys, key)) return null;
    removedKeys[key] = true;
    operations.push({ op: "remove", path: op.path, key });
  }

  return operations;
}

export function planRootRecordRemoveStrategy(
  input: PlanRootRecordRemoveStrategyInput,
): RootRecordRemoveStrategyPlan {
  const { sourceKeys, operations } = input;
  const keepCount = sourceKeys.length - operations.length;
  const removedKeys = rootRecordRemoveKeySet(operations);
  const strategy: RootRecordRemovePatchStrategy = operations.length === sourceKeys.length
    ? "clear"
    : removedRootKeysMatchSuffix(sourceKeys, keepCount, removedKeys)
      ? "copyPrefix"
      : operations.length * 2 < sourceKeys.length
        ? "copyDelete"
        : "rebuild";
  return { strategy, keepCount };
}

function rootRecordRemoveKeySet(
  operations: ReadonlyArray<RootRecordRemoveOperationPlan>,
): Record<string, true> {
  return createDataKeySet(operations.map((op) => op.key));
}

function applyRootRecordAddPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  if (!Array.isArray(ops) || ops.length === 0) return null;
  const root = readRootRecordForLocalPatch({ state });
  if (!root.ok) return null;

  const plan = planRootRecordAddPatch({ operations: ops });
  if (plan === null) return null;

  const valueValidation = evaluateRootRecordAddValues({
    schema,
    state,
    operations: plan.operations,
    valuesTrusted,
  });
  if (!valueValidation.ok) return valueValidation.result;

  const next = applyRootRecordAddPlan({ source: root.source, plan });

  return okLocalPatch(next as z.output<S>, toAppliedAddOperations(plan.operations));
}

export function readRootRecordForLocalPatch(input: ReadRootRecordForLocalPatchInput): ReadRootRecordForLocalPatchResult {
  const { state } = input;
  if (state === null || typeof state !== "object" || Array.isArray(state)) return { ok: false };
  const source = state as Record<string, unknown>;
  return { ok: true, source, sourceKeys: Object.keys(source) };
}

export function evaluateRootRecordAddValues<S extends z.ZodType>(
  input: EvaluateRootRecordAddValuesInput<S>,
): RootRecordAddValuesValidationResult<S> {
  const { schema, state, operations, valuesTrusted } = input;
  const valueSchema = rootRecordValueSchemaForLocalPatch(schema);
  if (valueSchema === null) return { ok: false, result: null };

  const valueValidator = knownJsonValueValidatorForSchema(valueSchema);
  const valueFailure = evaluateAppliedAddValueValidationPlan(
    state,
    operations,
    valueSchema,
    (value) => acceptsKnownJsonValueWithValidator(valueValidator, value),
    valuesTrusted,
  );
  return valueFailure ? { ok: false, result: valueFailure } : { ok: true };
}

export function rootRecordValueSchemaForLocalPatch(schema: z.ZodType): z.ZodType | null {
  const rootDef = getDef(schema) as ExtendedDef;
  if (
    rootDef.type !== "record"
    || (rootDef.keyType && !isPlainStringKeySchema(rootDef.keyType))
    || !rootDef.valueType
  ) {
    return null;
  }
  return rootDef.valueType;
}

export function applyRootRecordAddPlan(input: ApplyRootRecordAddPlanInput): Record<string, unknown> {
  const next = copyRootRecord(input.source);
  for (const op of input.plan.operations) {
    writeRootRecordValue(next, op.key, op.value);
  }
  return next;
}

export function planRootRecordAddPatch(input: PlanRootRecordAddPatchInput): RootRecordAddPatchPlan | null {
  const operations = planRootRecordAddOperations(input);
  return operations === null ? null : { operations };
}

export function planRootRecordAddOperations(
  input: PlanRootRecordAddOperationsInput,
): RootRecordAddOperationPlan[] | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length === 0) return null;

  const operations: RootRecordAddOperationPlan[] = [];
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "add"
      || typeof op.path !== "string"
      || op.path === ""
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return null;
    }
    operations.push({ op: "add", path: op.path, key: op.path.slice(1), value: op.value });
  }

  return operations;
}

function applySequentialPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  const plan = planSequentialPatch({ operations: ops });
  if (plan === null) return null;

  const applied = applySequentialLocalOperations({
    schema,
    state,
    operations: plan.operations,
    valuesTrusted,
  });
  return applied.ok ? okLocalPatch(applied.state as z.output<S>, applied.applied) : applied.result;
}

export function applySequentialLocalOperations<S extends z.ZodType>(
  input: ApplySequentialLocalOperationsInput<S>,
): SequentialLocalOperationsResult<S> {
  let cur: unknown = input.state;
  const appliedOps: JSONPatchOperation[] = [];
  for (const op of input.operations) {
    const applied = applySequentialLocalOperation({
      schema: input.schema,
      state: input.state,
      current: cur,
      operation: op,
      valuesTrusted: input.valuesTrusted,
    });
    if (!applied.ok) return { ok: false, result: applied.result };
    cur = applied.state;
    appliedOps.push(applied.applied);
  }

  return { ok: true, state: cur, applied: appliedOps };
}

export function applySequentialLocalOperation<S extends z.ZodType>(
  input: ApplySequentialLocalOperationInput<S>,
): SequentialLocalOperationResult<S> {
  const sourceValue = readAppliedLocalOpSourceValue({
    state: input.current,
    operation: input.operation,
  });
  const applied = applySequentialLocalOperationPatch({
    current: input.current,
    operation: input.operation,
    valuesTrusted: input.valuesTrusted,
  });
  if (!applied.result.ok) {
    return { ok: false, result: failedLocalPatch(input.state, applied.result) };
  }

  const appliedOp = applied.applied[0];
  if (!appliedOp) return { ok: false, result: null };
  const validation = validateAppliedLocalOp(input.schema, input.state, appliedOp, sourceValue);
  if (validation === null || !validation.result.ok) return { ok: false, result: validation };
  return { ok: true, state: applied.state, applied: appliedOp };
}

export function applySequentialLocalOperationPatch(
  input: ApplySequentialLocalOperationPatchInput,
): SequentialLocalOperationPatchResult {
  const applied = input.valuesTrusted
    ? applyAcceptedPatch(input.current, [input.operation])
    : applyTrustedPatch(input.current, [input.operation]);
  return applied.result.ok
    ? { state: applied.state, result: applied.result, applied: applied.applied }
    : { state: input.current, result: applied.result, applied: [] };
}

export function planSequentialPatch(input: PlanSequentialPatchInput): SequentialPatchPlan | null {
  const ops = input.operations;
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

function applyAppendOnlyAddPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  const plan = planAppendOnlyArrayAddPatch({ operations: ops });
  if (plan === null) return null;
  const { parent, parentSegments, values } = plan;

  const current = readArrayAtSegments({ state, segments: parentSegments });
  if (!current.ok) return null;
  const initialLength = current.array.length;

  return applyValidatedArrayAddPlan({
    schema,
    state,
    parent,
    parentSegments,
    array: current.array,
    start: initialLength,
    values,
    valuesTrusted,
  });
}

export function planAppendOnlyArrayAddPatch(
  input: PlanAppendOnlyArrayAddPatchInput,
): AppendOnlyArrayAddPatchPlan | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length < 2) return null;

  if (!(0 in ops)) return null;
  const first = ops[0]!;
  if (!isAppendArrayAddOperationCandidate(first)) return null;

  const appendPath = first.path;
  const parent = appendPath.slice(0, -2) as Pointer;
  const values = planAppendOnlyArrayAddValues({ operations: ops, appendPath });
  if (values === null) return null;

  let parentSegments: string[];
  try {
    parentSegments = parsePointer(parent);
  } catch {
    return null;
  }

  return { parent, parentSegments, values };
}

export function planAppendOnlyArrayAddValues(
  input: PlanAppendOnlyArrayAddValuesInput,
): unknown[] | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length < 2 || !input.appendPath.endsWith("/-")) return null;

  const values = new Array<unknown>(ops.length);

  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (!isAppendArrayAddOperationCandidate(op) || op.path !== input.appendPath) return null;
    values[index] = op.value;
  }

  return values;
}

function isAppendArrayAddOperationCandidate(
  op: JSONPatchOperation,
): op is Extract<JSONPatchOperation, { op: "add" }> {
  return !!op
    && typeof op === "object"
    && validateOperationShape(op) === null
    && op.op === "add"
    && typeof op.path === "string"
    && op.path.endsWith("/-");
}

function applyIncreasingArrayAddPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  const plan = planIncreasingArrayAddPatch({ operations: ops });
  if (plan === null) return null;
  const { parent, parentSegments, start, values } = plan;

  const current = readArrayAtSegments({ state, segments: parentSegments });
  if (!current.ok) return null;

  return applyValidatedArrayAddPlan({
    schema,
    state,
    parent,
    parentSegments,
    array: current.array,
    start,
    values,
    valuesTrusted,
  });
}

export function evaluateArrayAddElementValues<S extends z.ZodType>(
  input: EvaluateArrayAddElementValuesInput<S>,
): ArrayAddElementValuesValidationResult<S> {
  const { schema, state, parent, operations, valuesTrusted } = input;
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

export function applyValidatedArrayAddPlan<S extends z.ZodType>(
  input: ApplyValidatedArrayAddPlanInput<S>,
): ApplyResult<S> | null {
  const applied = planArrayAddAppliedOperations({
    parent: input.parent,
    start: input.start,
    values: input.values,
  });
  const valueValidation = evaluateArrayAddElementValues({
    schema: input.schema,
    state: input.state,
    parent: input.parent,
    operations: applied,
    valuesTrusted: input.valuesTrusted,
  });
  if (!valueValidation.ok) return valueValidation.result;

  const nextState = applyArrayAddPlan({
    state: input.state,
    parentSegments: input.parentSegments,
    array: input.array,
    start: input.start,
    values: input.values,
  });
  return nextState === null ? null : okLocalPatch(nextState as z.output<S>, applied);
}

export function applyArrayAddPlan(input: ApplyArrayAddPlanInput): unknown | null {
  const { state, parentSegments, array, start, values } = input;
  if (start < 0 || start > array.length) return null;

  const nextArray = start === array.length
    ? array.concat(values)
    : array.slice(0, start).concat(values, array.slice(start));
  return replaceValueAtSegments(state, parentSegments, 0, nextArray);
}

export function readArrayAtSegments(input: ReadArrayAtSegmentsInput): ReadArrayAtSegmentsResult {
  const current = readAt(input.state, input.segments);
  return current.ok && Array.isArray(current.value)
    ? { ok: true, array: current.value }
    : { ok: false };
}

export function buildValidatedArrayIndexReplacements<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(
  input: BuildValidatedArrayIndexReplacementsInput<S, Operation>,
): ValidatedArrayIndexReplacementsResult<S> {
  const { state, array, operations, valueSchema, valuesTrusted, replacementValue } = input;
  const valueValidator = knownJsonValueValidatorForSchema(valueSchema);
  const replacements = new Array<ArrayIndexReplacement>(operations.length);

  for (let opIndex = 0; opIndex < operations.length; opIndex += 1) {
    const op = operations[opIndex]!;
    if (op.index < 0 || op.index >= array.length) return { ok: false, result: null };

    const replacement = replacementValue(op, array[op.index]);
    if (!replacement.ok) return { ok: false, result: null };

    const valueFailure = evaluateAppliedReplaceValueValidationPlan(
      state,
      [op],
      valueSchema,
      (value) => acceptsKnownJsonValueWithValidator(valueValidator, value),
      valuesTrusted,
    );
    if (valueFailure) return { ok: false, result: valueFailure };

    replacements[opIndex] = { index: op.index, value: replacement.value };
  }

  return { ok: true, replacements };
}

export function applyValidatedArrayIndexReplacements<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(
  input: ApplyValidatedArrayIndexReplacementsInput<S, Operation>,
): ApplyResult<S> | null {
  const replacements = buildValidatedArrayIndexReplacements(input);
  if (!replacements.ok) return replacements.result;

  const nextState = applyArrayIndexReplacements({
    state: input.state,
    arraySegments: input.arraySegments,
    array: input.array,
    replacements: replacements.replacements,
  });
  return nextState === null
    ? null
    : okLocalPatch(nextState as z.output<S>, toAppliedReplaceOperations(input.operations));
}

export function applyValidatedArrayFieldReplacements<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(
  input: ApplyValidatedArrayFieldReplacementsInput<S, Operation>,
): ApplyResult<S> | null {
  return applyValidatedArrayIndexReplacements({
    state: input.state,
    arraySegments: input.arraySegments,
    array: input.array,
    operations: input.operations,
    valueSchema: input.valueSchema,
    valuesTrusted: input.valuesTrusted,
    replacementValue: (op, currentValue) => {
      const replaced = replaceObjectDataValue(currentValue, input.field, op.value);
      return replaced === null ? { ok: false } : { ok: true, value: replaced };
    },
  });
}

export function applyValidatedArrayFieldReplacementsAtSegments<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(
  input: ApplyValidatedArrayFieldReplacementsAtSegmentsInput<S, Operation>,
): ApplyResult<S> | null {
  const current = readArrayAtSegments({ state: input.state, segments: input.arraySegments });
  if (!current.ok) return null;

  return applyValidatedArrayFieldReplacements({
    state: input.state,
    arraySegments: input.arraySegments,
    array: current.array,
    field: input.field,
    operations: input.operations,
    valueSchema: input.valueSchema,
    valuesTrusted: input.valuesTrusted,
  });
}

export function applyValidatedArrayNestedReplacements<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(
  input: ApplyValidatedArrayNestedReplacementsInput<S, Operation>,
): ApplyResult<S> | null {
  const replacements = buildValidatedArrayIndexReplacements(input);
  if (!replacements.ok) return replacements.result;

  const nextState = applyArrayNestedReplacements({
    state: input.state,
    arraySegments: input.arraySegments,
    array: input.array,
    suffixSegments: input.suffixSegments,
    replacements: replacements.replacements,
  });
  return nextState === null
    ? null
    : okLocalPatch(nextState as z.output<S>, toAppliedReplaceOperations(input.operations));
}

export function applyValidatedArrayNestedValueReplacements<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(
  input: ApplyValidatedArrayNestedValueReplacementsInput<S, Operation>,
): ApplyResult<S> | null {
  return applyValidatedArrayNestedReplacements({
    state: input.state,
    arraySegments: input.arraySegments,
    array: input.array,
    suffixSegments: input.suffixSegments,
    operations: input.operations,
    valueSchema: input.valueSchema,
    valuesTrusted: input.valuesTrusted,
    replacementValue: (op) => ({ ok: true, value: op.value }),
  });
}

export function applyValidatedArrayNestedValueReplacementsAtSegments<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(
  input: ApplyValidatedArrayNestedValueReplacementsAtSegmentsInput<S, Operation>,
): ApplyResult<S> | null {
  const current = readArrayAtSegments({ state: input.state, segments: input.arraySegments });
  if (!current.ok) return null;

  return applyValidatedArrayNestedValueReplacements({
    state: input.state,
    arraySegments: input.arraySegments,
    array: current.array,
    suffixSegments: input.suffixSegments,
    operations: input.operations,
    valueSchema: input.valueSchema,
    valuesTrusted: input.valuesTrusted,
  });
}

export function buildKnownJsonArrayIndexReplacements<
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(
  input: BuildKnownJsonArrayIndexReplacementsInput<Operation>,
): ArrayIndexReplacement[] | null {
  const { schema, array, operations } = input;
  const valueValidator = knownJsonValueValidatorForSchema(schema);
  const replacements = new Array<ArrayIndexReplacement>(operations.length);

  for (let opIndex = 0; opIndex < operations.length; opIndex += 1) {
    const op = operations[opIndex]!;
    if (op.index < 0 || op.index >= array.length) return null;
    if (!acceptsKnownJsonValueWithValidator(valueValidator, op.value)) return null;
    replacements[opIndex] = { index: op.index, value: op.value };
  }

  return replacements;
}

export function applyKnownJsonArrayIndexReplacements<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(
  input: ApplyKnownJsonArrayIndexReplacementsInput<S, Operation>,
): ApplyResult<S> | null {
  const replacements = buildKnownJsonArrayIndexReplacements(input);
  if (replacements === null) return null;

  const nextState = applyArrayIndexReplacements({
    state: input.state,
    arraySegments: input.arraySegments,
    array: input.array,
    replacements,
  });
  return nextState === null
    ? null
    : okLocalPatch(nextState as z.output<S>, toAppliedReplaceOperations(input.operations));
}

export function applyKnownJsonArrayIndexReplacementsAtSegments<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(
  input: ApplyKnownJsonArrayIndexReplacementsAtSegmentsInput<S, Operation>,
): ApplyResult<S> | null {
  const current = readArrayAtSegments({ state: input.state, segments: input.arraySegments });
  if (!current.ok) return null;

  return applyKnownJsonArrayIndexReplacements({
    state: input.state,
    schema: input.schema,
    arraySegments: input.arraySegments,
    array: current.array,
    operations: input.operations,
  });
}

export function applyArrayIndexReplacements(input: ApplyArrayIndexReplacementsInput): unknown | null {
  const { state, arraySegments, array, replacements } = input;
  const next = array.slice();
  for (const replacement of replacements) {
    if (replacement.index < 0 || replacement.index >= next.length) return null;
    next[replacement.index] = replacement.value;
  }
  return replaceValueAtSegments(state, arraySegments, 0, next);
}

export function applyArrayNestedReplacements(input: ApplyArrayNestedReplacementsInput): unknown | null {
  const { state, arraySegments, array, suffixSegments, replacements } = input;
  const rowReplacements = new Array<ArrayIndexReplacement>(replacements.length);
  for (let index = 0; index < replacements.length; index += 1) {
    const replacement = replacements[index]!;
    if (replacement.index < 0 || replacement.index >= array.length) return null;
    const replaced = replaceValueAtSegments(
      array[replacement.index],
      suffixSegments,
      0,
      replacement.value,
    );
    if (replaced === null) return null;
    rowReplacements[index] = { index: replacement.index, value: replaced };
  }
  return applyArrayIndexReplacements({
    state,
    arraySegments,
    array,
    replacements: rowReplacements,
  });
}

export function planIncreasingArrayAddPatch(
  input: PlanIncreasingArrayAddPatchInput,
): IncreasingArrayAddPatchPlan | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length < 2) return null;

  if (!(0 in ops)) return null;
  const first = ops[0]!;
  if (!isIndexedArrayAddOperationCandidate(first)) return null;

  const firstLocation = arrayIndexPathLocation(first.path);
  if (firstLocation === null || firstLocation.index === "-") return null;

  const { parent, parentSegments } = firstLocation;
  const start = firstLocation.index;
  const values = planIncreasingArrayAddValues({ operations: ops, parent, start });
  return values === null ? null : { parent, parentSegments, start, values };
}

export function planIncreasingArrayAddValues(
  input: PlanIncreasingArrayAddValuesInput,
): unknown[] | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length < 2) return null;

  const { parent, start } = input;
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

function isIndexedArrayAddOperationCandidate(
  op: JSONPatchOperation,
): op is Extract<JSONPatchOperation, { op: "add" }> {
  return !!op
    && typeof op === "object"
    && validateOperationShape(op) === null
    && op.op === "add"
    && typeof op.path === "string"
    && !op.path.endsWith("/-");
}

function applySameArrayPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  const plan = planSameArrayPatch({ operations: ops });
  if (plan === null) return null;

  const addOperations = plan.operations.filter((op): op is Extract<SameArrayPatchOperationPlan, { op: "add" }> =>
    op.op === "add"
  );
  const valueValidation = evaluateArrayAddElementValues({
    schema,
    state,
    parent: plan.parent,
    operations: addOperations,
    valuesTrusted,
  });
  if (!valueValidation.ok) return valueValidation.result;

  const applied = applyTrustedPatch(state, ops, { valuesTrusted: true });
  if (!applied.result.ok) {
    return failedLocalPatch(state, applied.result);
  }
  return okLocalPatch(applied.state as z.output<S>, applied.applied);
}

export function planSameArrayPatch(input: PlanSameArrayPatchInput): SameArrayPatchPlan | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length < 1) return null;

  if (!(0 in ops)) return null;
  const first = ops[0]!;
  if (!isSameArrayPatchOperationCandidate(first)) return null;

  const firstLocation = arrayIndexPathLocation(first.path);
  if (firstLocation === null) return null;

  const operations = planSameArrayPatchOperations({
    operations: ops,
    parent: firstLocation.parent,
  });
  if (operations === null) return null;

  return {
    parent: firstLocation.parent,
    parentSegments: firstLocation.parentSegments,
    operations,
  };
}

export function planSameArrayPatchOperations(
  input: PlanSameArrayPatchOperationsInput,
): SameArrayPatchOperationPlan[] | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length < 1) return null;

  const operations = new Array<SameArrayPatchOperationPlan>(ops.length);

  for (let index = 0; index < ops.length; index++) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (!isSameArrayPatchOperationCandidate(op)) return null;

    const location = arrayIndexInParent(op.path, input.parent);
    if (location === null) return null;
    const pathIndex = location.index;

    if (op.op === "add") {
      operations[index] = { op: "add", path: op.path, index: pathIndex, value: op.value };
    } else if (op.op === "remove") {
      if (pathIndex === "-") return null;
      operations[index] = { op: "remove", path: op.path, index: pathIndex };
    } else {
      const fromLocation = arrayIndexInParent(op.from, input.parent);
      if (fromLocation === null || fromLocation.index === "-") return null;
      operations[index] = {
        op: op.op,
        from: op.from,
        path: op.path,
        fromIndex: fromLocation.index,
        index: pathIndex,
      };
    }
  }

  return operations;
}

function isSameArrayPatchOperationCandidate(
  op: JSONPatchOperation,
): op is Extract<
  JSONPatchOperation,
  { op: "add" } | { op: "remove" } | { op: "copy" } | { op: "move" }
> {
  return !!op
    && typeof op === "object"
    && validateOperationShape(op) === null
    && (
      op.op === "add"
      || op.op === "remove"
      || op.op === "copy"
      || op.op === "move"
    )
    && typeof op.path === "string";
}

function validateAppliedLocalOp<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  appliedOp: JSONPatchOperation,
  sourceValue: AppliedLocalOpSourceValue,
): LocalPatchResult<S> {
  const plan = planAppliedLocalOpValidation({ schema, operation: appliedOp, sourceValue });
  if (plan === null) return null;
  return evaluateAppliedLocalOpValidationPlan(state, appliedOp, plan);
}

export function evaluateAppliedLocalOpValidationPlan<S extends z.ZodType>(
  state: z.output<S>,
  appliedOp: JSONPatchOperation,
  plan: AppliedLocalOpValidationPlan,
): ApplyResult<S> {
  if (plan.kind === "presence") return okLocalPatch(state, [appliedOp]);

  const parsed = plan.schema.safeParse(plan.value);
  return parsed.success
    ? okLocalPatch(state, [appliedOp])
    : schemaViolation(state, plan.path, parsed.error.issues);
}

export function planAppliedLocalOpValidation(
  input: PlanAppliedLocalOpValidationInput,
): AppliedLocalOpValidationPlan | null {
  const { operation, schema, sourceValue } = input;
  switch (operation.op) {
    case "replace": {
      if (operation.path === "") return null;
      const valueSchema = cachedSchemaAtPointer(schema, operation.path, "value");
      return valueSchema === null
        ? null
        : { kind: "parse", path: operation.path, schema: valueSchema, value: operation.value };
    }
    case "add": {
      const element = arrayElementSchemaAtPath(schema, operation.path);
      return element === null
        ? null
        : { kind: "parse", path: operation.path, schema: element, value: operation.value };
    }
    case "remove":
      return arrayElementSchemaAtPath(schema, operation.path) === null
        ? null
        : { kind: "presence" };
    case "copy": {
      const element = arrayElementSchemaAtPath(schema, operation.path);
      return element === null || !sourceValue.ok
        ? null
        : { kind: "parse", path: operation.path, schema: element, value: sourceValue.value };
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
    && (
      op.op === "replace"
      || op.op === "add"
      || op.op === "remove"
      || op.op === "copy"
      || op.op === "move"
    )
    && typeof op.path === "string";
}

export function arrayIndexInParent(path: Pointer, parent: Pointer): { index: number | "-" } | null {
  const simple = parseSimpleArrayIndexPath(path);
  if (simple !== null) {
    return simple.parent === parent ? { index: simple.index } : null;
  }

  if (parentPointer(path) !== parent) return null;
  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  const segment = segments[segments.length - 1];
  if (segment === undefined) return null;
  const index = segment === "-" ? "-" : numericSegment(segment);
  return index === null ? null : { index };
}

export function arrayIndexPathLocation(
  path: Pointer,
): { parent: Pointer; parentSegments: string[]; index: number | "-" } | null {
  const simple = parseSimpleArrayIndexPath(path);
  if (simple !== null) {
    return {
      parent: simple.parent,
      parentSegments: simple.parent === "" ? [] : simple.parent.slice(1).split("/"),
      index: simple.index,
    };
  }

  const parent = parentPointer(path);
  if (parent === null) return null;
  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  const segment = segments[segments.length - 1];
  if (segment === undefined) return null;
  const index = segment === "-" ? "-" : numericSegment(segment);
  return index === null ? null : { parent, parentSegments: segments.slice(0, -1), index };
}

function parseSimpleArrayIndexPath(path: Pointer): { parent: Pointer; index: number | "-" } | null {
  if (path === "" || path[0] !== "/" || path.includes("~")) return null;
  const indexSlash = path.lastIndexOf("/");
  if (indexSlash < 0) return null;

  const segment = path.slice(indexSlash + 1);
  const index = segment === "-" ? "-" : numericSegment(segment);
  return index === null
    ? null
    : { parent: path.slice(0, indexSlash), index };
}

function arrayElementReplaceLocation(
  path: Pointer,
): { parent: Pointer; parentSegments: string[]; index: number } | null {
  const simple = parseSimpleArrayElementReplacePath(path);
  if (simple !== null) return simple;

  const parent = parentPointer(path);
  if (parent === null) return null;
  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  const segment = segments[segments.length - 1];
  if (segment === undefined) return null;
  const index = numericSegment(segment);
  if (index === null) return null;
  return { parent, parentSegments: segments.slice(0, -1), index };
}

function arrayElementIndexPrefix(parent: Pointer): string {
  return parent === "" ? "/" : `${parent}/`;
}

function parseKnownArrayElementReplaceIndex(path: Pointer, prefix: string): number | null {
  if (!path.startsWith(prefix)) return null;
  const indexText = path.slice(prefix.length);
  return indexText.includes("/") ? null : numericSegment(indexText);
}

function parseSimpleArrayElementReplacePath(
  path: Pointer,
): { parent: Pointer; parentSegments: string[]; index: number } | null {
  if (path === "" || path[0] !== "/" || path.includes("~")) return null;
  const indexSlash = path.lastIndexOf("/");
  if (indexSlash < 0) return null;

  const index = numericSegment(path.slice(indexSlash + 1));
  if (index === null) return null;

  const parent = path.slice(0, indexSlash);
  return {
    parent,
    parentSegments: parent === "" ? [] : parent.slice(1).split("/"),
    index,
  };
}

export function planIndependentReplacePatch(input: PlanIndependentReplacePatchInput): boolean {
  const paths = planIndependentReplacePaths(input);
  return paths === null ? false : haveIndependentReplacePaths(paths);
}

export function planIndependentReplacePaths(input: PlanIndependentReplacePathsInput): Pointer[] | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length === 0) return null;
  const paths = new Array<Pointer>(ops.length);

  for (let index = 0; index < ops.length; index++) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "replace"
      || typeof op.path !== "string"
      || op.path === ""
    ) {
      return null;
    }
    try {
      const segments = parsePointer(op.path);
      if (segments.includes("-")) return null;
    } catch {
      return null;
    }
    paths[index] = op.path;
  }

  return paths;
}

export function haveIndependentReplacePaths(paths: ReadonlyArray<Pointer>): boolean {
  if (!Array.isArray(paths) || paths.length === 0) return false;

  const sorted = [...paths].sort();
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current === previous || current.startsWith(`${previous}/`)) return false;
  }
  return true;
}

function parseArrayFieldPath(path: Pointer): ArrayFieldPath | null {
  const simple = parseSimpleArrayFieldPath(path);
  if (simple !== null) return simple;

  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  if (segments.length < 2) return null;
  const index = numericSegment(segments[segments.length - 2]!);
  return index === null
    ? null
    : {
        arrayPath: buildPointer(segments.slice(0, -2)),
        index,
        key: segments[segments.length - 1]!,
      };
}

function arrayFieldText(path: Pointer): ArrayFieldText | null {
  const keySlash = path.lastIndexOf("/");
  if (keySlash <= 0) return null;
  const indexSlash = path.lastIndexOf("/", keySlash - 1);
  return indexSlash < 0
    ? null
    : {
        prefixText: path.slice(0, indexSlash + 1),
        suffixText: path.slice(keySlash),
      };
}

function parseKnownArrayFieldIndex(path: Pointer, text: ArrayFieldText): number | null {
  if (!path.startsWith(text.prefixText) || !path.endsWith(text.suffixText)) return null;
  const indexEnd = path.length - text.suffixText.length;
  const indexText = path.slice(text.prefixText.length, indexEnd);
  return indexText.includes("/") ? null : numericSegment(indexText);
}

function parseSimpleArrayFieldPath(path: Pointer): ArrayFieldPath | null {
  if (path === "" || path[0] !== "/" || path.includes("~")) return null;
  const keySlash = path.lastIndexOf("/");
  if (keySlash <= 0) return null;
  const indexSlash = path.lastIndexOf("/", keySlash - 1);
  if (indexSlash < 0) return null;

  const index = numericSegment(path.slice(indexSlash + 1, keySlash));
  if (index === null) return null;

  return { arrayPath: path.slice(0, indexSlash), index, key: path.slice(keySlash + 1) };
}

function parseFirstArrayNestedPath(state: unknown, path: Pointer): ArrayNestedPath | null {
  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  if (segments.length < 3) return null;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const rowIndex = numericSegment(segments[index]!);
    if (rowIndex === null) continue;

    const arraySegments = segments.slice(0, index);
    const current = readArrayAtSegments({ state, segments: arraySegments });
    if (!current.ok) continue;

    const arrayPath = buildPointer(arraySegments);
    const suffixSegments = segments.slice(index + 1);
    return {
      arrayPath,
      arraySegments,
      index: rowIndex,
      prefixText: arrayNestedPrefixText(arrayPath),
      suffixText: buildPointer(suffixSegments),
      suffixSegments,
    };
  }

  return null;
}

function parseKnownArrayNestedIndex(
  path: Pointer,
  arrayPath: Pointer,
  suffixSegments: string[],
  prefixText: string,
  suffixText: string,
): number | null {
  const knownIndex = parseKnownArrayNestedIndexText(path, prefixText, suffixText);
  if (knownIndex !== null) return knownIndex;

  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  if (segments.length < suffixSegments.length + 2) return null;

  const arraySegmentsLength = segments.length - suffixSegments.length - 1;
  for (let index = 0; index < suffixSegments.length; index += 1) {
    if (segments[arraySegmentsLength + 1 + index] !== suffixSegments[index]) return null;
  }

  const arraySegments = segments.slice(0, arraySegmentsLength);
  if (buildPointer(arraySegments) !== arrayPath) return null;

  return numericSegment(segments[arraySegmentsLength]!);
}

function arrayNestedPrefixText(arrayPath: Pointer): string {
  return arrayPath === "" ? "/" : `${arrayPath}/`;
}

function parseKnownArrayNestedIndexText(
  path: Pointer,
  prefixText: string,
  suffixText: string,
): number | null {
  if (!path.startsWith(prefixText) || !path.endsWith(suffixText)) return null;
  const indexEnd = path.length - suffixText.length;
  const indexText = path.slice(prefixText.length, indexEnd);
  return indexText.includes("/") ? null : numericSegment(indexText);
}

export function arrayElementSchemaAtPath(schema: z.ZodType, path: Pointer): z.ZodType | null {
  const location = arrayIndexPathLocation(path);
  if (location === null) return null;
  return arrayElementSchemaAtParent(schema, location.parent);
}

export function arrayElementSchemaAtParent(schema: z.ZodType, parent: Pointer): z.ZodType | null {
  const parentSchema = cachedSchemaAtPointer(schema, parent, "value");
  return parentSchema ? getArrayElement(parentSchema) : null;
}

export function readAppliedLocalOpSourceValue(
  input: ReadAppliedLocalOpSourceValueInput,
): AppliedLocalOpSourceValue {
  const { operation, state } = input;
  if (operation.op !== "copy" && operation.op !== "move") return { ok: false };
  try {
    return readAt(state, parsePointer(operation.from));
  } catch {
    return { ok: false };
  }
}

export function replaceValueAtSegments(
  current: unknown,
  segments: ReadonlyArray<string>,
  index: number,
  value: unknown,
): unknown | null {
  if (index === segments.length) return value;
  if (current === null || typeof current !== "object") return null;

  const segment = segments[index]!;
  if (Array.isArray(current)) {
    const childIndex = numericSegment(segment);
    if (childIndex === null || childIndex >= current.length) return null;
    const child = replaceValueAtSegments(current[childIndex], segments, index + 1, value);
    if (child === null) return null;
    const next = current.slice();
    next[childIndex] = child;
    return next;
  }

  if (!objectHasOwn.call(current, segment)) return null;
  const child = replaceValueAtSegments(
    (current as Record<string, unknown>)[segment],
    segments,
    index + 1,
    value,
  );
  if (child === null) return null;
  return replaceObjectDataValue(current, segment, child);
}

export function acceptsKnownJsonValue(schema: z.ZodType, value: unknown): boolean {
  const validator = knownJsonValueValidatorForSchema(schema);
  return acceptsKnownJsonValueWithValidator(validator, value);
}

function acceptsKnownJsonValueWithValidator(
  validator: KnownJsonValueValidator | null,
  value: unknown,
): boolean {
  return validator !== null
    && validator(value, value !== null && typeof value === "object"
      ? new WeakSet<object>()
      : primitiveJsonValueSeen);
}

function knownJsonValueValidatorForSchema(schema: z.ZodType): KnownJsonValueValidator | null {
  const cached = knownJsonValueValidatorCache.get(schema as object);
  if (cached !== undefined) return cached;
  const validator = buildKnownJsonValueValidator(schema, new WeakSet<object>());
  knownJsonValueValidatorCache.set(schema as object, validator);
  return validator;
}

function buildKnownJsonValueValidator(
  schema: z.ZodType,
  seenSchemas: WeakSet<object>,
): KnownJsonValueValidator | null {
  if (seenSchemas.has(schema as object)) return null;
  seenSchemas.add(schema as object);
  const validator = buildKnownJsonValueValidatorUnchecked(schema, seenSchemas);
  seenSchemas.delete(schema as object);
  return validator;
}

function buildKnownJsonValueValidatorUnchecked(
  schema: z.ZodType,
  seenSchemas: WeakSet<object>,
): KnownJsonValueValidator | null {
  const def = getDef(schema) as ExtendedDef;
  if (def.coerce || (Array.isArray(def.checks) && def.checks.length > 0)) return null;

  switch (def.type) {
    case "string":
      return (value) => typeof value === "string";
    case "number":
      return (value) => typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return (value) => typeof value === "boolean";
    case "null":
      return (value) => value === null;
    case "literal":
      return buildLiteralValueValidator(def);
    case "enum":
      return buildEnumValueValidator(def);
    case "optional": {
      const inner = def.innerType ? buildKnownJsonValueValidator(def.innerType, seenSchemas) : null;
      return inner === null ? null : (value, seen) => value !== undefined && inner(value, seen);
    }
    case "nullable": {
      const inner = def.innerType ? buildKnownJsonValueValidator(def.innerType, seenSchemas) : null;
      return inner === null ? null : (value, seen) => value === null || inner(value, seen);
    }
    case "object":
      return buildObjectValueValidator(schema, def, seenSchemas);
    case "array":
      return buildArrayValueValidator(schema, seenSchemas);
    case "record":
      return buildRecordValueValidator(def, seenSchemas);
    default:
      return null;
  }
}

function buildObjectValueValidator(
  schema: z.ZodType,
  def: ExtendedDef,
  seenSchemas: WeakSet<object>,
): KnownJsonValueValidator | null {
  if (def.catchall) return null;
  const shape = getObjectShape(schema);
  if (!shape) return null;

  const fields: Array<{ key: string; optional: boolean; validate: KnownJsonValueValidator }> = [];
  for (const key of Object.keys(shape)) {
    const childSchema = shape[key];
    if (!childSchema) return null;
    const validate = buildKnownJsonValueValidator(childSchema, seenSchemas);
    if (validate === null) return null;
    fields.push({
      key,
      optional: isOptionalSchema(childSchema),
      validate,
    });
  }

  return (value, seen) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    if (seen.has(value)) return false;
    seen.add(value);

    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    if (Object.getOwnPropertySymbols(value).length > 0) return false;

    const names = Object.getOwnPropertyNames(value);
    let present = 0;
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field.key);
      if (!descriptor) {
        if (field.optional) continue;
        return false;
      }
      if (!descriptor.enumerable || "get" in descriptor || "set" in descriptor) return false;
      if (!field.validate(descriptor.value, seen)) return false;
      present += 1;
    }
    return names.length === present;
  };
}

function buildArrayValueValidator(
  schema: z.ZodType,
  seenSchemas: WeakSet<object>,
): KnownJsonValueValidator | null {
  const element = getArrayElement(schema);
  if (!element) return null;
  const validateElement = buildKnownJsonValueValidator(element, seenSchemas);
  if (validateElement === null) return null;

  return (value, seen) => {
    if (!Array.isArray(value)) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    if (Object.getOwnPropertySymbols(value).length > 0) return false;
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== value.length + 1 || names[names.length - 1] !== "length") return false;

    for (let index = 0; index < value.length; index += 1) {
      const key = names[index];
      if (key !== String(index)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || "get" in descriptor || "set" in descriptor) return false;
      if (!validateElement(descriptor.value, seen)) return false;
    }
    return true;
  };
}

function buildRecordValueValidator(
  def: ExtendedDef,
  seenSchemas: WeakSet<object>,
): KnownJsonValueValidator | null {
  if (def.keyType && !isPlainStringKeySchema(def.keyType)) return null;
  if (!def.valueType) return null;
  const validateValue = buildKnownJsonValueValidator(def.valueType, seenSchemas);
  if (validateValue === null) return null;

  return (value, seen) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    if (seen.has(value)) return false;
    seen.add(value);

    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    if (Object.getOwnPropertySymbols(value).length > 0) return false;

    for (const key of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || "get" in descriptor || "set" in descriptor) return false;
      if (!validateValue(descriptor.value, seen)) return false;
    }
    return true;
  };
}

function buildLiteralValueValidator(def: ExtendedDef): KnownJsonValueValidator | null {
  if (!Array.isArray(def.values) || !def.values.every(isJsonPrimitive)) return null;
  return (value) => def.values!.some((item) => Object.is(item, value));
}

function buildEnumValueValidator(def: ExtendedDef): KnownJsonValueValidator | null {
  const values = Array.isArray(def.values)
    ? def.values
    : def.entries && typeof def.entries === "object"
      ? Object.values(def.entries)
      : null;
  if (values === null || !values.every(isJsonPrimitive)) return null;
  return (value) => values.some((item) => Object.is(item, value));
}

function isPlainStringKeySchema(schema: z.ZodType): boolean {
  const def = getDef(schema) as ExtendedDef;
  return def.type === "string"
    && !def.coerce
    && (!Array.isArray(def.checks) || def.checks.length === 0);
}

function isOptionalSchema(schema: z.ZodType): boolean {
  return (getDef(schema) as ExtendedDef).type === "optional";
}

function isJsonPrimitive(value: unknown): boolean {
  return value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value));
}

export function okLocalPatch<S extends z.ZodType>(
  state: z.output<S>,
  applied: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> {
  return {
    state,
    result: { ok: true },
    applied,
  };
}

export function failedLocalPatch<S extends z.ZodType>(
  state: z.output<S>,
  result: Extract<JSONResult, { ok: false }>,
): ApplyResult<S> {
  return {
    state,
    result,
    applied: [],
  };
}

function schemaViolation<S extends z.ZodType>(
  state: z.output<S>,
  path: Pointer,
  issues: z.ZodError["issues"],
): ApplyResult<S> {
  return failedLocalPatch(
    state,
    {
      ok: false,
      code: "schema_violation",
      reason: JSON.stringify(prefixIssues(path, issues)),
    },
  );
}

function operationFailure<S extends z.ZodType>(
  state: z.output<S>,
  code: "not_serializable",
  reason: string,
): ApplyResult<S> {
  return failedLocalPatch(state, { ok: false, code, reason });
}

function cachedSchemaAtPointer(
  schema: z.ZodType,
  pointer: Pointer,
  mode: "value" | "insert" = "value",
): z.ZodType | null {
  let cache = localSchemaCaches.get(schema as object);
  if (!cache) {
    cache = { pointerSchemas: new Map() };
    localSchemaCaches.set(schema as object, cache);
  }
  const key = `${mode}\0${pointer}`;
  const cached = cache.pointerSchemas.get(key);
  if (cached !== undefined) return cached;
  const result = schemaAtPointer(schema, pointer, mode);
  cache.pointerSchemas.set(key, result);
  return result;
}

function isPlainStructuralSchema(schema: z.ZodType, seen?: WeakSet<object>): boolean {
  const cached = plainStructuralSchemaCache.get(schema as object);
  if (cached !== undefined) return cached;
  const activeSeen = seen ?? new WeakSet<object>();
  if (activeSeen.has(schema as object)) return true;
  activeSeen.add(schema as object);

  const def = getDef(schema) as ExtendedDef;
  if (Array.isArray(def.checks) && def.checks.length > 0) return cachePlainStructuralSchema(schema, false);

  switch (def.type) {
    case "object": {
      const shape = getObjectShape(schema);
      if (!shape) return cachePlainStructuralSchema(schema, false);
      if (!Object.values(shape).every((child) => isPlainStructuralSchema(child, activeSeen))) {
        return cachePlainStructuralSchema(schema, false);
      }
      return cachePlainStructuralSchema(
        schema,
        def.catchall ? isPlainStructuralSchema(def.catchall, activeSeen) : true,
      );
    }
    case "array": {
      const element = getArrayElement(schema);
      return cachePlainStructuralSchema(schema, element ? isPlainStructuralSchema(element, activeSeen) : false);
    }
    case "record":
      return cachePlainStructuralSchema(
        schema,
        (!def.keyType || isPlainStructuralSchema(def.keyType, activeSeen))
          && !!def.valueType
          && isPlainStructuralSchema(def.valueType, activeSeen),
      );
    case "optional":
    case "nullable":
      return cachePlainStructuralSchema(schema, !!def.innerType && isPlainStructuralSchema(def.innerType, activeSeen));
    case "string":
    case "number":
    case "boolean":
    case "null":
    case "literal":
    case "enum":
    case "unknown":
    case "any":
    case "never":
      return cachePlainStructuralSchema(schema, true);
    default:
      return cachePlainStructuralSchema(schema, false);
  }
}

function cachePlainStructuralSchema(schema: z.ZodType, value: boolean): boolean {
  plainStructuralSchemaCache.set(schema as object, value);
  return value;
}

function schemaOutputIsKnownJsonInternal(schema: z.ZodType, seen?: WeakSet<object>): boolean {
  const cached = knownJsonOutputSchemaCache.get(schema as object);
  if (cached !== undefined) return cached;
  const shouldCache = seen === undefined;
  const finish = (value: boolean): boolean => shouldCache
    ? cacheKnownJsonOutputSchema(schema, value)
    : value;
  const activeSeen = seen ?? new WeakSet<object>();
  if (activeSeen.has(schema as object)) return true;
  activeSeen.add(schema as object);

  const def = getDef(schema) as ExtendedDef;
  if (def.coerce) return finish(false);

  switch (def.type) {
    case "object": {
      const shape = getObjectShape(schema);
      if (!shape) return finish(false);
      for (const key of Object.keys(shape)) {
        if (key === "__proto__") return finish(false);
        const child = shape[key];
        if (!child || !schemaOutputIsKnownJsonInternal(child, activeSeen)) {
          return finish(false);
        }
      }
      if (def.catchall && !schemaOutputIsKnownJsonInternal(def.catchall, activeSeen)) {
        return finish(false);
      }
      return finish(true);
    }
    case "array": {
      const element = getArrayElement(schema);
      return finish(element ? schemaOutputIsKnownJsonInternal(element, activeSeen) : false);
    }
    case "nullable":
      return finish(
        !!def.innerType && schemaOutputIsKnownJsonInternal(def.innerType, activeSeen),
      );
    case "nonoptional": {
      if (!def.innerType) return finish(false);
      const innerDef = getDef(def.innerType) as ExtendedDef;
      const outputSchema = innerDef.type === "optional" ? innerDef.innerType : def.innerType;
      return finish(!!outputSchema && schemaOutputIsKnownJsonInternal(outputSchema, activeSeen));
    }
    case "prefault":
      return finish(!!def.innerType && schemaOutputIsKnownJsonInternal(def.innerType, activeSeen));
    case "pipe":
      return finish(!!def.out && schemaOutputIsKnownJsonInternal(def.out, activeSeen));
    case "intersection":
      return finish(
        !!def.left
          && !!def.right
          && schemaOutputIsKnownJsonInternal(def.left, activeSeen)
          && schemaOutputIsKnownJsonInternal(def.right, activeSeen),
      );
    case "string":
    case "number":
    case "boolean":
    case "null":
      return finish(true);
    case "literal":
      return finish(Array.isArray(def.values) && def.values.every(isJsonPrimitive));
    case "enum": {
      const values = Array.isArray(def.values)
        ? def.values
        : def.entries && typeof def.entries === "object"
          ? Object.values(def.entries)
          : null;
      return finish(values !== null && values.every(isJsonPrimitive));
    }
    case "record":
      return finish(
        (!def.keyType || isPlainStringKeySchema(def.keyType))
          && !!def.valueType
          && schemaOutputIsKnownJsonInternal(def.valueType, activeSeen),
      );
    case "union":
      return finish(
        Array.isArray(def.options)
          && def.options.length > 0
          && def.options.every((option) => schemaOutputIsKnownJsonInternal(option, activeSeen)),
      );
    case "tuple":
      return finish(
        Array.isArray(def.items)
          && def.items.every((item) => schemaOutputIsKnownJsonInternal(item, activeSeen))
          && (!def.rest || schemaOutputIsKnownJsonInternal(def.rest, activeSeen)),
      );
    case "readonly":
      return finish(!!def.innerType && schemaOutputIsKnownJsonInternal(def.innerType, activeSeen));
    case "lazy": {
      if (!def.getter) return finish(false);
      try {
        return finish(schemaOutputIsKnownJsonInternal(def.getter(), activeSeen));
      } catch {
        return finish(false);
      }
    }
    default:
      return finish(false);
  }
}

function cacheKnownJsonOutputSchema(schema: z.ZodType, value: boolean): boolean {
  knownJsonOutputSchemaCache.set(schema as object, value);
  return value;
}

export function prefixIssues(
  path: Pointer,
  issues: z.ZodError["issues"],
): z.ZodError["issues"] {
  const prefix = parsePointer(path).map((segment) => numericSegment(segment) ?? segment);
  return issues.map((issue) => ({
    ...issue,
    path: [...prefix, ...issue.path],
  }));
}

export function numericSegment(segment: string): number | null {
  if (segment.length === 0) return null;
  const first = segment.charCodeAt(0);
  if (first === 48) return segment.length === 1 ? 0 : null;
  if (first < 49 || first > 57) return null;
  for (let index = 1; index < segment.length; index += 1) {
    const code = segment.charCodeAt(index);
    if (code < 48 || code > 57) return null;
  }
  return Number(segment);
}

export function appendArrayIndexPath(parent: Pointer, index: number): Pointer {
  return parent === "" ? `/${index}` : `${parent}/${index}`;
}

function indexDirection(previous: number, current: number): -1 | 0 | 1 {
  return current > previous ? 1 : current < previous ? -1 : 0;
}
