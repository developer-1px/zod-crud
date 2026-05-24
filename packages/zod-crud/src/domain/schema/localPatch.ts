import type * as z from "zod";

import {
  applyAcceptedPatch,
  applyTrustedPatch,
  type ApplyResult,
  type JSONPatchOperation,
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

export interface PlanIndependentReplacePatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface PlanSingleReplacePatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface SingleReplacePatchPlan {
  operation: Extract<JSONPatchOperation, { op: "replace" }>;
}

export interface PlanSingleRootObjectReplacePatchInput {
  operation: JSONPatchOperation;
  sourceKeys: ReadonlyArray<string>;
}

export interface SingleRootObjectReplacePatchPlan {
  operation: Extract<JSONPatchOperation, { op: "replace" }>;
  key: string;
}

export interface PlanKnownJsonReplacePatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface KnownJsonReplacePatchPlan {
  operations: Extract<JSONPatchOperation, { op: "replace" }>[];
}

export interface PlanSequentialPatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type SequentialPatchOperationPlan = Exclude<JSONPatchOperation, { op: "test" }>;

export interface SequentialPatchPlan {
  operations: SequentialPatchOperationPlan[];
}

export interface PlanAppendOnlyArrayAddPatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface AppendOnlyArrayAddPatchPlan {
  parent: Pointer;
  parentSegments: string[];
  values: unknown[];
}

export interface PlanIncreasingArrayAddPatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
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

export interface RootRecordAddOperationPlan {
  op: "add";
  path: Pointer;
  key: string;
  value: unknown;
}

export interface RootRecordAddPatchPlan {
  operations: RootRecordAddOperationPlan[];
}

export interface PlanRootRecordRemovePatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
  sourceKeys: ReadonlyArray<string>;
}

export type RootRecordRemovePatchStrategy = "clear" | "copyPrefix" | "copyDelete" | "rebuild";

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

export interface PlanRootObjectReplacePatchInput {
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

export interface PlanSameArrayFieldReplacePatchInput {
  operations: ReadonlyArray<JSONPatchOperation>;
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

interface ArrayFieldText {
  prefixText: string;
  suffixText: string;
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

function copyRootRecordKeyPrefix(
  source: Record<string, unknown>,
  keys: ReadonlyArray<string>,
  end: number,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  if (!objectHasOwn.call(source, "__proto__")) {
    for (let index = 0; index < end; index += 1) {
      const key = keys[index]!;
      next[key] = source[key];
    }
    return next;
  }

  for (let index = 0; index < end; index += 1) {
    const key = keys[index]!;
    if (key !== "__proto__") {
      next[key] = source[key];
      continue;
    }
    Object.defineProperty(next, key, {
      value: source[key],
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return next;
}

function writeRootRecordValue(target: Record<string, unknown>, key: string, value: unknown): void {
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

  const applied = valuesTrusted ? applyAcceptedPatch(state, ops) : applyTrustedPatch(state, ops);
  if (!applied.result.ok) {
    return {
      state,
      result: applied.result,
      applied: [],
    };
  }

  for (const op of applied.applied) {
    if (op.op !== "replace") return null;
    const valueSchema = cachedSchemaAtPointer(schema, op.path, "value");
    if (!valueSchema) return null;
    if (acceptsKnownJsonValue(valueSchema, op.value)) continue;
    const parsed = valueSchema.safeParse(op.value);
    if (!parsed.success) {
      return schemaViolation(state, op.path, parsed.error.issues);
    }
  }

  return {
    state: applied.state as z.output<S>,
    result: { ok: true },
    applied: applied.applied,
  };
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

  const valueSchema = cachedSchemaAtPointer(schema, op.path, "value");
  if (!valueSchema) return null;

  const valueAccepted = acceptsKnownJsonValue(valueSchema, op.value);
  if (!valueAccepted && !valuesTrusted) {
    const jsonError = jsonSerializableError(op.value);
    if (jsonError !== null) return operationFailure(state, "not_serializable", jsonError);
  }
  if (!valueAccepted) {
    const result = valueSchema.safeParse(op.value);
    if (!result.success) return schemaViolation(state, op.path, result.error.issues);
  }

  const singleArrayFieldReplace = applySingleArrayFieldReplacePatchWithLocalSchemaValidation(state, op);
  if (singleArrayFieldReplace) {
    return {
      state: singleArrayFieldReplace as z.output<S>,
      result: { ok: true },
      applied: [op],
    };
  }

  const singleRootReplace = applySingleRootObjectReplacePatchWithLocalSchemaValidation(state, op);
  if (singleRootReplace) {
    return {
      state: singleRootReplace as z.output<S>,
      result: { ok: true },
      applied: [op],
    };
  }

  const applied = applyAcceptedPatch(state, [op]);
  if (!applied.result.ok) {
    return {
      state,
      result: applied.result,
      applied: [],
    };
  }
  return {
    state: applied.state as z.output<S>,
    result: { ok: true },
    applied: applied.applied,
  };
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
  const location = parseArrayFieldPath(op.path);
  if (location === null) return null;

  const rootArrayReplace = applySingleRootArrayFieldReplace(state, location, op.value);
  if (rootArrayReplace !== null) return rootArrayReplace;

  let arraySegments: string[];
  try {
    arraySegments = parsePointer(location.arrayPath);
  } catch {
    return null;
  }

  const current = readAt(state, arraySegments);
  if (!current.ok || !Array.isArray(current.value)) return null;
  if (location.index < 0 || location.index >= current.value.length) return null;

  const row = current.value[location.index];
  if (row === null || typeof row !== "object" || Array.isArray(row)) return null;
  if (!objectHasOwn.call(row, location.key)) return null;

  const replaced = { ...(row as Record<string, unknown>) };
  if (location.key === "__proto__") {
    Object.defineProperty(replaced, location.key, {
      value: op.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  } else {
    replaced[location.key] = op.value;
  }

  const next = current.value.slice();
  next[location.index] = replaced;
  return replaceValueAtSegments(state, arraySegments, 0, next);
}

function applySingleRootArrayFieldReplace(
  state: unknown,
  location: ArrayFieldPath,
  value: unknown,
): unknown | null {
  if (location.arrayPath === "") {
    if (!Array.isArray(state)) return null;
    return replaceArrayField(state, location.index, location.key, value);
  }

  if (
    location.arrayPath[0] !== "/"
    || location.arrayPath.includes("~")
    || location.arrayPath.indexOf("/", 1) !== -1
  ) {
    return null;
  }

  const arrayKey = location.arrayPath.slice(1);
  if (
    arrayKey === "__proto__"
    || state === null
    || typeof state !== "object"
    || Array.isArray(state)
    || !objectHasOwn.call(state, arrayKey)
  ) {
    return null;
  }

  const current = (state as Record<string, unknown>)[arrayKey];
  if (!Array.isArray(current)) return null;
  const nextArray = replaceArrayField(current, location.index, location.key, value);
  if (nextArray === null) return null;
  return { ...(state as Record<string, unknown>), [arrayKey]: nextArray };
}

function replaceArrayField(
  array: ReadonlyArray<unknown>,
  index: number,
  key: string,
  value: unknown,
): unknown[] | null {
  if (index < 0 || index >= array.length) return null;
  const row = array[index];
  if (row === null || typeof row !== "object" || Array.isArray(row)) return null;
  if (!objectHasOwn.call(row, key)) return null;

  const replaced = { ...(row as Record<string, unknown>) };
  if (key === "__proto__") {
    Object.defineProperty(replaced, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  } else {
    replaced[key] = value;
  }

  const next = array.slice();
  next[index] = replaced;
  return next;
}

function applySingleRootObjectReplacePatchWithLocalSchemaValidation(
  state: unknown,
  op: Extract<JSONPatchOperation, { op: "replace" }>,
): unknown | null {
  if (state === null || typeof state !== "object" || Array.isArray(state)) return null;
  const source = state as Record<string, unknown>;
  const plan = planSingleRootObjectReplacePatch({
    operation: op,
    sourceKeys: Object.keys(source),
  });
  if (plan === null) return null;

  const next = copyRootRecord(source);
  writeRootRecordValue(next, plan.key, op.value);
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

  for (const op of plan.operations) {
    const valueSchema = cachedSchemaAtPointer(schema, op.path, "value");
    if (!valueSchema || !acceptsKnownJsonValue(valueSchema, op.value)) return null;
  }

  const applied = applyAcceptedPatch(state, plan.operations);
  if (!applied.result.ok) {
    return {
      state,
      result: applied.result,
      applied: [],
    };
  }
  return {
    state: applied.state as z.output<S>,
    result: { ok: true },
    applied: applied.applied,
  };
}

export function planKnownJsonReplacePatch(input: PlanKnownJsonReplacePatchInput): KnownJsonReplacePatchPlan | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length === 0) return null;

  const operations: Extract<JSONPatchOperation, { op: "replace" }>[] = [];
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "replace"
      || typeof op.path !== "string"
    ) {
      return null;
    }
    operations.push(op);
  }

  return { operations };
}

function applyKnownJsonSameArrayElementReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): LocalPatchResult<S> {
  const plan = planSameArrayElementReplacePatch({ operations: ops });
  if (plan === null) return null;

  const parentSchema = cachedSchemaAtPointer(schema, plan.parent, "value");
  const elementSchema = parentSchema ? getArrayElement(parentSchema) : null;
  if (!elementSchema) return null;
  const elementValidator = knownJsonValueValidatorForSchema(elementSchema);

  const current = readAt(state, plan.parentSegments);
  if (!current.ok || !Array.isArray(current.value)) return null;
  const next = current.value.slice();
  const applied = new Array<JSONPatchOperation>(plan.operations.length);

  for (let opIndex = 0; opIndex < plan.operations.length; opIndex += 1) {
    const op = plan.operations[opIndex]!;
    if (!acceptsKnownJsonValueWithValidator(elementValidator, op.value)) return null;
    if (op.index < 0 || op.index >= next.length) return null;
    next[op.index] = op.value;
    applied[opIndex] = { op: "replace", path: op.path, value: op.value };
  }

  const nextState = replaceValueAtSegments(state, plan.parentSegments, 0, next);
  if (nextState === null) return null;
  return {
    state: nextState as z.output<S>,
    result: { ok: true },
    applied,
  };
}

export function planSameArrayElementReplacePatch(
  input: PlanSameArrayElementReplacePatchInput,
): SameArrayElementReplacePatchPlan | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length === 0) return null;

  let parent: Pointer | null = null;
  let parentIndexPrefix: string | null = null;
  let parentSegments: string[] | null = null;
  const operations: SameArrayElementReplaceOperationPlan[] = [];

  for (let opIndex = 0; opIndex < ops.length; opIndex += 1) {
    if (!(opIndex in ops)) return null;
    const op = ops[opIndex]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "replace"
      || typeof op.path !== "string"
    ) {
      return null;
    }

    let index: number;
    if (parent === null) {
      const location = arrayElementReplaceLocation(op.path);
      if (location === null) return null;
      parent = location.parent;
      parentIndexPrefix = arrayElementIndexPrefix(parent);
      parentSegments = location.parentSegments;
      index = location.index;
    } else {
      if (parentIndexPrefix === null) return null;
      const parsedIndex = parseKnownArrayElementReplaceIndex(op.path, parentIndexPrefix);
      if (parsedIndex === null) return null;
      index = parsedIndex;
    }

    operations.push({ op: "replace", path: op.path, index, value: op.value });
  }

  return parent === null || parentSegments === null
    ? null
    : { parent, parentSegments, operations };
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
  const valueValidator = knownJsonValueValidatorForSchema(valueSchema);

  const current = readAt(state, plan.arraySegments);
  if (!current.ok || !Array.isArray(current.value)) return null;
  const next = current.value.slice();
  const applied = new Array<JSONPatchOperation>(plan.operations.length);

  for (let opIndex = 0; opIndex < plan.operations.length; opIndex++) {
    const op = plan.operations[opIndex]!;
    if (op.index < 0 || op.index >= next.length) return null;
    const row = next[op.index];
    if (row === null || typeof row !== "object" || Array.isArray(row)) return null;
    if (!objectHasOwn.call(row, plan.field)) return null;
    const valueAccepted = acceptsKnownJsonValueWithValidator(valueValidator, op.value);
    if (!valueAccepted && !valuesTrusted) {
      const jsonError = jsonSerializableError(op.value);
      if (jsonError !== null) return operationFailure(state, "not_serializable", jsonError);
    }
    if (!valueAccepted) {
      const result = valueSchema.safeParse(op.value);
      if (!result.success) return schemaViolation(state, op.path, result.error.issues);
    }

    const sourceRow = row as Record<string, unknown>;
    const replaced = { ...sourceRow };
    if (plan.field === "__proto__") {
      Object.defineProperty(replaced, plan.field, {
        value: op.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      replaced[plan.field] = op.value;
    }
    next[op.index] = replaced;
    applied[opIndex] = { op: "replace", path: op.path, value: op.value };
  }

  const nextState = replaceValueAtSegments(state, plan.arraySegments, 0, next);
  if (nextState === null) return null;
  return {
    state: nextState as z.output<S>,
    result: { ok: true },
    applied,
  };
}

export function planSameArrayFieldReplacePatch(
  input: PlanSameArrayFieldReplacePatchInput,
): SameArrayFieldReplacePatchPlan | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length < 2) return null;

  let arrayPath: Pointer | null = null;
  let arraySegments: string[] | null = null;
  let field: string | null = null;
  let fieldText: ArrayFieldText | null = null;
  const operations: SameArrayFieldReplaceOperationPlan[] = [];

  for (let opIndex = 0; opIndex < ops.length; opIndex++) {
    if (!(opIndex in ops)) return null;
    const op = ops[opIndex]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "replace"
      || typeof op.path !== "string"
      || op.path === ""
    ) {
      return null;
    }

    const knownIndex = fieldText === null ? null : parseKnownArrayFieldIndex(op.path, fieldText);
    let location: ArrayFieldPath | null;
    if (knownIndex === null) {
      location = parseArrayFieldPath(op.path);
    } else {
      if (arrayPath === null || field === null) return null;
      location = { arrayPath, index: knownIndex, key: field };
    }
    if (location === null) return null;

    if (arrayPath === null) {
      arrayPath = location.arrayPath;
      try {
        arraySegments = parsePointer(arrayPath);
      } catch {
        return null;
      }
    } else if (arrayPath !== location.arrayPath) {
      return null;
    }

    if (field === null) {
      field = location.key;
      fieldText = arrayFieldText(op.path);
    } else if (field !== location.key) {
      return null;
    }

    operations.push({ op: "replace", path: op.path, index: location.index, value: op.value });
  }

  return arrayPath === null || arraySegments === null || field === null
    ? null
    : { arrayPath, arraySegments, field, operations };
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
  const valueValidator = knownJsonValueValidatorForSchema(valueSchema);

  const current = readAt(state, plan.arraySegments);
  if (!current.ok || !Array.isArray(current.value)) return null;
  const arrayValue = current.value;
  const updateValues = new Array<unknown>(plan.operations.length);
  const applied = new Array<JSONPatchOperation>(plan.operations.length);

  for (let opIndex = 0; opIndex < plan.operations.length; opIndex += 1) {
    const op = plan.operations[opIndex]!;
    if (op.index < 0 || op.index >= arrayValue.length) return null;
    const valueAccepted = acceptsKnownJsonValueWithValidator(valueValidator, op.value);
    if (!valueAccepted && !valuesTrusted) {
      const jsonError = jsonSerializableError(op.value);
      if (jsonError !== null) return operationFailure(state, "not_serializable", jsonError);
    }
    if (!valueAccepted) {
      const parsed = valueSchema.safeParse(op.value);
      if (!parsed.success) return schemaViolation(state, op.path, parsed.error.issues);
    }
    updateValues[opIndex] = op.value;
    applied[opIndex] = { op: "replace", path: op.path, value: op.value };
  }

  const next = arrayValue.slice();
  for (let index = 0; index < plan.operations.length; index += 1) {
    const rowIndex = plan.operations[index]!.index;
    const value = updateValues[index];
    const replaced = replaceValueAtSegments(arrayValue[rowIndex], plan.suffixSegments, 0, value);
    if (replaced === null) return null;
    next[rowIndex] = replaced;
  }

  const nextState = replaceValueAtSegments(state, plan.arraySegments, 0, next);
  if (nextState === null) return null;
  return {
    state: nextState as z.output<S>,
    result: { ok: true },
    applied,
  };
}

export function planSameArrayNestedReplacePatch(
  input: PlanSameArrayNestedReplacePatchInput,
): SameArrayNestedReplacePatchPlan | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length < 2) return null;

  let arrayPath: Pointer | null = null;
  let arraySegments: string[] | null = null;
  let prefixText: string | null = null;
  let suffixText: string | null = null;
  let suffixSegments: string[] | null = null;
  const operations: SameArrayNestedReplaceOperationPlan[] = [];

  for (let opIndex = 0; opIndex < ops.length; opIndex += 1) {
    if (!(opIndex in ops)) return null;
    const op = ops[opIndex]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "replace"
      || typeof op.path !== "string"
      || op.path === ""
    ) {
      return null;
    }

    let index: number;
    if (arrayPath === null) {
      const location = parseFirstArrayNestedPath(input.state, op.path);
      if (location === null) return null;
      arrayPath = location.arrayPath;
      arraySegments = location.arraySegments;
      prefixText = location.prefixText;
      suffixText = location.suffixText;
      suffixSegments = location.suffixSegments;
      index = location.index;
    } else {
      if (suffixSegments === null || prefixText === null || suffixText === null) return null;
      const parsedIndex = parseKnownArrayNestedIndex(
        op.path,
        arrayPath,
        suffixSegments,
        prefixText,
        suffixText,
      );
      if (parsedIndex === null) return null;
      index = parsedIndex;
    }

    operations.push({ op: "replace", path: op.path, index, value: op.value });
  }

  return arrayPath === null || arraySegments === null || suffixSegments === null
    ? null
    : { arrayPath, arraySegments, suffixSegments, operations };
}

function applyRootObjectReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  if (
    !Array.isArray(ops)
    || ops.length < 2
    || state === null
    || typeof state !== "object"
    || Array.isArray(state)
  ) {
    return null;
  }

  const shape = getObjectShape(schema);
  const rootDef = shape === null ? getDef(schema) as ExtendedDef : null;
  const recordValueSchema = rootDef?.type === "record" ? (rootDef.valueType ?? null) : null;
  const recordValueValidator = recordValueSchema
    ? knownJsonValueValidatorForSchema(recordValueSchema)
    : null;
  const source = state as Record<string, unknown>;
  const sourceKeys = Object.keys(source);
  const plan = planRootObjectReplacePatch({ operations: ops, sourceKeys });
  if (plan === null) return null;
  const applied = new Array<JSONPatchOperation>(plan.operations.length);

  for (let index = 0; index < plan.operations.length; index += 1) {
    const op = plan.operations[index]!;
    const valueSchema = shape
      ? (objectHasOwn.call(shape, op.key) ? (shape[op.key] ?? null) : null)
      : recordValueSchema;
    if (!valueSchema) return null;
    const valueAccepted = shape
      ? acceptsKnownJsonValue(valueSchema, op.value)
      : acceptsKnownJsonValueWithValidator(recordValueValidator, op.value);
    if (!valueAccepted && !valuesTrusted) {
      const jsonError = jsonSerializableError(op.value);
      if (jsonError !== null) return operationFailure(state, "not_serializable", jsonError);
    }
    if (!valueAccepted) {
      const result = valueSchema.safeParse(op.value);
      if (!result.success) return schemaViolation(state, op.path, result.error.issues);
    }
    applied[index] = { op: "replace", path: op.path, value: op.value };
  }

  const resultState = plan.strategy === "orderedReplace"
    ? {}
    : copyRootRecordKeys(source, sourceKeys);
  for (const op of plan.operations) {
    writeRootRecordValue(resultState, op.key, op.value);
  }

  return {
    state: resultState as z.output<S>,
    result: { ok: true },
    applied,
  };
}

export function planRootObjectReplacePatch(
  input: PlanRootObjectReplacePatchInput,
): RootObjectReplacePatchPlan | null {
  const ops = input.operations;
  const sourceKeys = input.sourceKeys;
  if (!Array.isArray(ops) || ops.length < 2 || !Array.isArray(sourceKeys)) return null;

  const sourceKeySet = Object.create(null) as Record<string, true>;
  for (const key of sourceKeys) {
    sourceKeySet[key] = true;
  }

  let ordered = ops.length === sourceKeys.length;
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
    if (ordered && key !== sourceKeys[index]) ordered = false;
    operations.push({ op: "replace", path: op.path, key, value: op.value });
  }

  return {
    operations,
    strategy: ordered ? "orderedReplace" : "copyWrite",
  };
}

function applyRootRecordRemovePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): LocalPatchResult<S> {
  if (
    !Array.isArray(ops)
    || ops.length === 0
    || state === null
    || typeof state !== "object"
    || Array.isArray(state)
  ) {
    return null;
  }

  const rootDef = getDef(schema) as ExtendedDef;
  if (rootDef.type !== "record" || (rootDef.keyType && !isPlainStringKeySchema(rootDef.keyType))) {
    return null;
  }

  const source = state as Record<string, unknown>;
  const sourceKeys = Object.keys(source);
  const plan = planRootRecordRemovePatch({ operations: ops, sourceKeys });
  if (plan === null) return null;
  const applied = plan.operations.map((op): JSONPatchOperation => ({ op: "remove", path: op.path }));

  if (plan.strategy === "clear") {
    return {
      state: {} as z.output<S>,
      result: { ok: true },
      applied,
    };
  }
  if (plan.strategy === "copyPrefix") {
    return {
      state: copyRootRecordKeyPrefix(source, sourceKeys, plan.keepCount) as z.output<S>,
      result: { ok: true },
      applied,
    };
  }
  if (plan.strategy === "copyDelete") {
    const next = copyRootRecordKeys(source, sourceKeys);
    for (const op of plan.operations) {
      delete next[op.key];
    }
    return {
      state: next as z.output<S>,
      result: { ok: true },
      applied,
    };
  }

  const removedKeys = rootRecordRemoveKeySet(plan.operations);
  const next: Record<string, unknown> = {};
  for (const key of sourceKeys) {
    if (objectHasOwn.call(removedKeys, key)) continue;
    if (key === "__proto__") {
      Object.defineProperty(next, key, {
        value: source[key],
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      next[key] = source[key];
    }
  }

  return {
    state: next as z.output<S>,
    result: { ok: true },
    applied,
  };
}

export function planRootRecordRemovePatch(
  input: PlanRootRecordRemovePatchInput,
): RootRecordRemovePatchPlan | null {
  const ops = input.operations;
  const sourceKeys = input.sourceKeys;
  if (!Array.isArray(ops) || ops.length === 0 || !Array.isArray(sourceKeys)) return null;

  const sourceKeySet = Object.create(null) as Record<string, true>;
  for (const key of sourceKeys) {
    sourceKeySet[key] = true;
  }

  const removedKeys = Object.create(null) as Record<string, true>;
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

  const keepCount = sourceKeys.length - operations.length;
  const strategy: RootRecordRemovePatchStrategy = operations.length === sourceKeys.length
    ? "clear"
    : removedRootKeysMatchSuffix(sourceKeys, keepCount, removedKeys)
      ? "copyPrefix"
      : operations.length * 2 < sourceKeys.length
        ? "copyDelete"
        : "rebuild";
  return { operations, strategy, keepCount };
}

function rootRecordRemoveKeySet(
  operations: ReadonlyArray<RootRecordRemoveOperationPlan>,
): Record<string, true> {
  const removedKeys = Object.create(null) as Record<string, true>;
  for (const op of operations) {
    removedKeys[op.key] = true;
  }
  return removedKeys;
}

function applyRootRecordAddPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  if (
    !Array.isArray(ops)
    || ops.length === 0
    || state === null
    || typeof state !== "object"
    || Array.isArray(state)
  ) {
    return null;
  }

  const plan = planRootRecordAddPatch({ operations: ops });
  if (plan === null) return null;

  const rootDef = getDef(schema) as ExtendedDef;
  const valueSchema = rootDef.valueType;
  if (
    rootDef.type !== "record"
    || (rootDef.keyType && !isPlainStringKeySchema(rootDef.keyType))
    || !valueSchema
  ) {
    return null;
  }

  const valueValidator = knownJsonValueValidatorForSchema(valueSchema);
  const applied = new Array<JSONPatchOperation>(plan.operations.length);

  for (let index = 0; index < plan.operations.length; index += 1) {
    const op = plan.operations[index]!;
    const valueAccepted = valueValidator !== null && valueValidator(op.value, new WeakSet<object>());
    if (!valueAccepted && !valuesTrusted) {
      const jsonError = jsonSerializableError(op.value);
      if (jsonError !== null) return operationFailure(state, "not_serializable", jsonError);
    }
    if (!valueAccepted) {
      const result = valueSchema.safeParse(op.value);
      if (!result.success) return schemaViolation(state, op.path, result.error.issues);
    }
    applied[index] = { op: "add", path: op.path, value: op.value };
  }

  const next = copyRootRecord(state as Record<string, unknown>);
  for (const op of plan.operations) {
    writeRootRecordValue(next, op.key, op.value);
  }

  return {
    state: next as z.output<S>,
    result: { ok: true },
    applied,
  };
}

export function planRootRecordAddPatch(input: PlanRootRecordAddPatchInput): RootRecordAddPatchPlan | null {
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

  return { operations };
}

function applySequentialPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  const plan = planSequentialPatch({ operations: ops });
  if (plan === null) return null;

  let cur: unknown = state;
  const appliedOps: JSONPatchOperation[] = [];
  for (const op of plan.operations) {
    const sourceValue = sourceValueForValidation(cur, op);
    const applied = valuesTrusted ? applyAcceptedPatch(cur, [op]) : applyTrustedPatch(cur, [op]);
    if (!applied.result.ok) {
      return {
        state,
        result: applied.result,
        applied: [],
      };
    }

    const appliedOp = applied.applied[0];
    if (!appliedOp) return null;
    const validation = validateAppliedLocalOp(schema, state, appliedOp, sourceValue);
    if (validation === null || !validation.result.ok) return validation;
    cur = applied.state;
    appliedOps.push(appliedOp);
  }

  return {
    state: cur as z.output<S>,
    result: { ok: true },
    applied: appliedOps,
  };
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
  const applied = new Array<JSONPatchOperation>(values.length);

  const parentSchema = cachedSchemaAtPointer(schema, parent, "value");
  const elementSchema = parentSchema ? getArrayElement(parentSchema) : null;
  if (!elementSchema) return null;
  const elementValidator = knownJsonValueValidatorForSchema(elementSchema);

  const current = readAt(state, parentSegments);
  if (!current.ok || !Array.isArray(current.value)) return null;
  const initialLength = current.value.length;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const valueAccepted = acceptsKnownJsonValueWithValidator(elementValidator, value);
    if (!valueAccepted && !valuesTrusted) {
      const jsonError = jsonSerializableError(value);
      if (jsonError !== null) return operationFailure(state, "not_serializable", jsonError);
    }
    if (!valueAccepted) {
      const parsed = elementSchema.safeParse(value);
      if (!parsed.success) return schemaViolation(state, appendArrayIndexPath(parent, initialLength + index), parsed.error.issues);
    }
    applied[index] = {
      op: "add",
      path: appendArrayIndexPath(parent, initialLength + index),
      value,
    };
  }

  const nextState = replaceValueAtSegments(
    state,
    parentSegments,
    0,
    current.value.concat(values),
  );
  if (nextState === null) return null;
  return {
    state: nextState as z.output<S>,
    result: { ok: true },
    applied,
  };
}

export function planAppendOnlyArrayAddPatch(
  input: PlanAppendOnlyArrayAddPatchInput,
): AppendOnlyArrayAddPatchPlan | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length < 2) return null;

  let parent: Pointer | null = null;
  let appendPath: string | null = null;
  const values = new Array<unknown>(ops.length);

  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "add"
      || typeof op.path !== "string"
      || !op.path.endsWith("/-")
    ) {
      return null;
    }

    if (appendPath === null) {
      appendPath = op.path;
      parent = op.path.slice(0, -2) as Pointer;
    } else if (op.path !== appendPath) {
      return null;
    }
    values[index] = op.value;
  }

  if (parent === null) return null;
  let parentSegments: string[];
  try {
    parentSegments = parsePointer(parent);
  } catch {
    return null;
  }

  return { parent, parentSegments, values };
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
  const parentSchema = cachedSchemaAtPointer(schema, parent, "value");
  const elementSchema = parentSchema ? getArrayElement(parentSchema) : null;
  if (!elementSchema) return null;
  const elementValidator = knownJsonValueValidatorForSchema(elementSchema);

  const current = readAt(state, parentSegments);
  if (!current.ok || !Array.isArray(current.value)) return null;
  if (start < 0 || start > current.value.length) return null;

  const applied = new Array<JSONPatchOperation>(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const path = appendArrayIndexPath(parent, start + index);
    const valueAccepted = acceptsKnownJsonValueWithValidator(elementValidator, value);
    if (!valueAccepted && !valuesTrusted) {
      const jsonError = jsonSerializableError(value);
      if (jsonError !== null) return operationFailure(state, "not_serializable", jsonError);
    }
    if (!valueAccepted) {
      const parsed = elementSchema.safeParse(value);
      if (!parsed.success) return schemaViolation(state, path, parsed.error.issues);
    }
    applied[index] = {
      op: "add",
      path,
      value,
    };
  }

  const nextState = replaceValueAtSegments(
    state,
    parentSegments,
    0,
    start === current.value.length
      ? current.value.concat(values)
      : current.value.slice(0, start).concat(values, current.value.slice(start)),
  );
  if (nextState === null) return null;
  return {
    state: nextState as z.output<S>,
    result: { ok: true },
    applied,
  };
}

export function planIncreasingArrayAddPatch(
  input: PlanIncreasingArrayAddPatchInput,
): IncreasingArrayAddPatchPlan | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length < 2) return null;

  const first = ops[0];
  if (
    first === undefined
    || validateOperationShape(first) !== null
    || first.op !== "add"
    || typeof first.path !== "string"
    || first.path.endsWith("/-")
  ) {
    return null;
  }

  const firstLocation = arrayIndexPathLocation(first.path);
  if (firstLocation === null || firstLocation.index === "-") return null;

  const { parent, parentSegments } = firstLocation;
  const start = firstLocation.index;
  const values = new Array<unknown>(ops.length);

  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "add"
      || typeof op.path !== "string"
      || op.path.endsWith("/-")
    ) {
      return null;
    }

    const location = index === 0
      ? { index: start }
      : arrayIndexInParent(op.path, parent);
    if (location === null || location.index === "-" || location.index !== start + index) return null;
    values[index] = op.value;
  }

  return { parent, parentSegments, start, values };
}

function applySameArrayPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  const plan = planSameArrayPatch({ operations: ops });
  if (plan === null) return null;
  const parentSchema = cachedSchemaAtPointer(schema, plan.parent, "value");
  const elementSchema = parentSchema ? getArrayElement(parentSchema) : null;
  if (elementSchema === null) return null;
  const elementValidator = knownJsonValueValidatorForSchema(elementSchema);

  for (const op of plan.operations) {
    if (op.op !== "add") continue;
    const valueAccepted = acceptsKnownJsonValueWithValidator(elementValidator, op.value);
    if (!valueAccepted && !valuesTrusted) {
      const jsonError = jsonSerializableError(op.value);
      if (jsonError !== null) return operationFailure(state, "not_serializable", jsonError);
    }
    if (!valueAccepted) {
      const parsed = elementSchema.safeParse(op.value);
      if (!parsed.success) return schemaViolation(state, op.path, parsed.error.issues);
    }
  }

  const applied = applyTrustedPatch(state, ops, { valuesTrusted: true });
  if (!applied.result.ok) {
    return {
      state,
      result: applied.result,
      applied: [],
    };
  }
  return {
    state: applied.state as z.output<S>,
    result: { ok: true },
    applied: applied.applied,
  };
}

export function planSameArrayPatch(input: PlanSameArrayPatchInput): SameArrayPatchPlan | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length < 1) return null;

  let parent: Pointer | null = null;
  let parentSegments: string[] | null = null;
  const operations: SameArrayPatchOperationPlan[] = [];

  for (let index = 0; index < ops.length; index++) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || (
        op.op !== "add"
        && op.op !== "remove"
        && op.op !== "copy"
        && op.op !== "move"
      )
      || typeof op.path !== "string"
    ) {
      return null;
    }

    let pathIndex: number | "-";
    if (parent === null) {
      const location = arrayIndexPathLocation(op.path);
      if (location === null) return null;
      parent = location.parent;
      parentSegments = location.parentSegments;
      pathIndex = location.index;
    } else {
      const location = arrayIndexInParent(op.path, parent);
      if (location === null) return null;
      pathIndex = location.index;
    }

    if (op.op === "add") {
      operations.push({ op: "add", path: op.path, index: pathIndex, value: op.value });
    } else if (op.op === "remove") {
      if (pathIndex === "-") return null;
      operations.push({ op: "remove", path: op.path, index: pathIndex });
    } else {
      const fromLocation = arrayIndexInParent(op.from, parent);
      if (fromLocation === null || fromLocation.index === "-") return null;
      operations.push({
        op: op.op,
        from: op.from,
        path: op.path,
        fromIndex: fromLocation.index,
        index: pathIndex,
      });
    }
  }

  return parent === null || parentSegments === null
    ? null
    : { parent, parentSegments, operations };
}

function validateAppliedLocalOp<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  appliedOp: JSONPatchOperation,
  sourceValue: { ok: true; value: unknown } | { ok: false },
): LocalPatchResult<S> {
  switch (appliedOp.op) {
    case "replace": {
      if (appliedOp.path === "") return null;
      const valueSchema = cachedSchemaAtPointer(schema, appliedOp.path, "value");
      if (!valueSchema) return null;
      const parsed = valueSchema.safeParse(appliedOp.value);
      return parsed.success
        ? okLocalPatch(state, [appliedOp])
        : schemaViolation(state, appliedOp.path, parsed.error.issues);
    }
    case "add": {
      const element = arrayElementSchemaAtPath(schema, appliedOp.path);
      if (!element) return null;
      const parsed = element.safeParse(appliedOp.value);
      return parsed.success
        ? okLocalPatch(state, [appliedOp])
        : schemaViolation(state, appliedOp.path, parsed.error.issues);
    }
    case "remove":
      return arrayElementSchemaAtPath(schema, appliedOp.path)
        ? okLocalPatch(state, [appliedOp])
        : null;
    case "copy": {
      const element = arrayElementSchemaAtPath(schema, appliedOp.path);
      if (!element || !sourceValue.ok) return null;
      const parsed = element.safeParse(sourceValue.value);
      return parsed.success
        ? okLocalPatch(state, [appliedOp])
        : schemaViolation(state, appliedOp.path, parsed.error.issues);
    }
    case "move": {
      const element = arrayElementSchemaAtPath(schema, appliedOp.path);
      if (!element || !sourceValue.ok || !arrayElementSchemaAtPath(schema, appliedOp.from)) return null;
      const parsed = element.safeParse(sourceValue.value);
      return parsed.success
        ? okLocalPatch(state, [appliedOp])
        : schemaViolation(state, appliedOp.path, parsed.error.issues);
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

function arrayIndexInParent(path: Pointer, parent: Pointer): { index: number | "-" } | null {
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

function arrayIndexPathLocation(
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
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length === 0) return false;
  const paths: string[] = [];
  for (let index = 0; index < ops.length; index++) {
    if (!(index in ops)) return false;
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "replace"
      || typeof op.path !== "string"
      || op.path === ""
    ) {
      return false;
    }
    try {
      const segments = parsePointer(op.path);
      if (segments.includes("-")) return false;
    } catch {
      return false;
    }
    paths.push(op.path);
  }

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
    const current = readAt(state, arraySegments);
    if (!current.ok || !Array.isArray(current.value)) continue;

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

function arrayElementSchemaAtPath(schema: z.ZodType, path: Pointer): z.ZodType | null {
  const parent = parentPointer(path);
  if (parent === null) return null;
  const parentSchema = cachedSchemaAtPointer(schema, parent, "value");
  return parentSchema ? getArrayElement(parentSchema) : null;
}

function sourceValueForValidation(
  state: unknown,
  op: JSONPatchOperation,
): { ok: true; value: unknown } | { ok: false } {
  if (op.op !== "copy" && op.op !== "move") return { ok: false };
  try {
    return readAt(state, parsePointer(op.from));
  } catch {
    return { ok: false };
  }
}

function replaceValueAtSegments(
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
  return { ...(current as Record<string, unknown>), [segment]: child };
}

function acceptsKnownJsonValue(schema: z.ZodType, value: unknown): boolean {
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

function okLocalPatch<S extends z.ZodType>(
  state: z.output<S>,
  applied: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> {
  return {
    state,
    result: { ok: true },
    applied,
  };
}

function schemaViolation<S extends z.ZodType>(
  state: z.output<S>,
  path: Pointer,
  issues: z.ZodError["issues"],
): ApplyResult<S> {
  return {
    state,
    result: {
      ok: false,
      code: "schema_violation",
      reason: JSON.stringify(prefixIssues(path, issues)),
    },
    applied: [],
  };
}

function operationFailure<S extends z.ZodType>(
  state: z.output<S>,
  code: "not_serializable",
  reason: string,
): ApplyResult<S> {
  return {
    state,
    result: { ok: false, code, reason },
    applied: [],
  };
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

function prefixIssues(
  path: Pointer,
  issues: z.ZodError["issues"],
): z.ZodError["issues"] {
  const prefix = parsePointer(path).map((segment) => numericSegment(segment) ?? segment);
  return issues.map((issue) => ({
    ...issue,
    path: [...prefix, ...issue.path],
  }));
}

function numericSegment(segment: string): number | null {
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

function appendArrayIndexPath(parent: Pointer, index: number): Pointer {
  return parent === "" ? `/${index}` : `${parent}/${index}`;
}

function indexDirection(previous: number, current: number): -1 | 0 | 1 {
  return current > previous ? 1 : current < previous ? -1 : 0;
}
