import type * as z from "zod";
import type { ApplyResult, JSONPatchOperation } from "../../../foundation/patch/types.js";
import { validateOperationShape } from "../../../foundation/patch/apply.js";
import {
  arrayFieldText,
  parseArrayFieldPath,
  parseFirstArrayNestedPath,
  parseKnownArrayFieldIndex,
  parseKnownArrayNestedIndex,
} from "../../../foundation/patch/path.js";
import type { ArrayFieldText } from "../../../foundation/patch/types.js";
import { replaceValueAtSegments } from "../../../foundation/patch/replaceValue.js";
import { parsePointer, type Pointer } from "../../../foundation/pointer/index.js";
import {
  acceptsKnownJsonValueWithValidator,
  knownJsonValueValidatorForSchema,
} from "../shared/knownJson.js";
import {
  arrayElementSchemaAtParent,
  cachedSchemaAtPointer,
} from "../shared/schema.js";
import { replaceObjectDataValue } from "../object/value.js";
import {
  arrayElementIndexPrefix,
  arrayElementReplaceLocation,
  parseKnownArrayElementReplaceIndex,
  readArrayAtSegments,
} from "./path.js";
import { okLocalSchemaValidation } from "../shared/result.js";
import {
  evaluateAppliedReplaceValueValidationPlan,
  toAppliedReplaceOperations,
  type IndexedReplaceValueValidationOperation,
} from "../shared/value.js";

export interface ArrayIndexReplacement {
  index: number;
  value: unknown;
}

export type ArrayReplacementValueResult =
  | { ok: true; value: unknown }
  | { ok: false };

export interface SingleArrayFieldReplacePlan {
  arrayPath: Pointer;
  index: number;
  key: string;
  value: unknown;
}

export interface SameArrayFieldReplacePatchPlan {
  arrayPath: Pointer;
  arraySegments: string[];
  field: string;
  operations: SameArrayFieldReplaceOperationPlan[];
}

export interface SameArrayFieldReplaceOperationPlan extends IndexedReplaceValueValidationOperation {
  op: "replace";
}

export interface SameArrayElementReplacePatchPlan {
  parent: Pointer;
  parentSegments: string[];
  operations: SameArrayElementReplaceOperationPlan[];
}

export interface SameArrayElementReplaceOperationPlan extends IndexedReplaceValueValidationOperation {
  op: "replace";
}

export interface SameArrayNestedReplacePatchPlan {
  arrayPath: Pointer;
  arraySegments: string[];
  suffixSegments: string[];
  operations: SameArrayNestedReplaceOperationPlan[];
}

export interface SameArrayNestedReplaceOperationPlan extends IndexedReplaceValueValidationOperation {
  op: "replace";
}

export function applySingleArrayFieldReplacePatchWithLocalSchemaValidation(
  state: unknown,
  op: Extract<JSONPatchOperation, { op: "replace" }>,
): unknown | null {
  return applySingleArrayFieldReplace({ state, path: op.path, value: op.value });
}

export function applySameArrayFieldReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): ApplyResult<S> | null {
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

export function applyKnownJsonSameArrayElementReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> | null {
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

export function applySameArrayNestedReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): ApplyResult<S> | null {
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

export function planSingleArrayFieldReplace(input: {
  path: Pointer;
  value: unknown;
}): SingleArrayFieldReplacePlan | null {
  const location = parseArrayFieldPath(input.path);
  return location === null ? null : { ...location, value: input.value };
}

export function planSameArrayElementReplacePatch(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
}): SameArrayElementReplacePatchPlan | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length === 0) return null;
  if (!(0 in ops)) return null;
  const first = ops[0]!;
  if (!isReplacePatchOperationCandidate(first)) return null;

  const firstLocation = arrayElementReplaceLocation(first.path);
  if (firstLocation === null) return null;
  const operations = planSameArrayElementReplaceOperations(ops, firstLocation.parent);
  return operations === null
    ? null
    : { parent: firstLocation.parent, parentSegments: firstLocation.parentSegments, operations };
}

export function planSameArrayElementReplaceOperations(
  ops: ReadonlyArray<JSONPatchOperation>,
  parent: Pointer,
): SameArrayElementReplaceOperationPlan[] | null {
  if (!Array.isArray(ops) || ops.length === 0) return null;
  const parentIndexPrefix = arrayElementIndexPrefix(parent);
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

export function planSameArrayFieldReplacePatch(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
}): SameArrayFieldReplacePatchPlan | null {
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
  const operations = planSameArrayFieldReplaceOperations(ops, firstLocation.arrayPath, firstLocation.key, fieldText);
  return operations === null ? null : { arrayPath: firstLocation.arrayPath, arraySegments, field: firstLocation.key, operations };
}

export function planSameArrayFieldReplaceOperations(
  ops: ReadonlyArray<JSONPatchOperation>,
  arrayPath: Pointer,
  field: string,
  fieldText: ArrayFieldText,
): SameArrayFieldReplaceOperationPlan[] | null {
  if (!Array.isArray(ops) || ops.length < 2) return null;
  const operations = new Array<SameArrayFieldReplaceOperationPlan>(ops.length);
  for (let opIndex = 0; opIndex < ops.length; opIndex += 1) {
    if (!(opIndex in ops)) return null;
    const op = ops[opIndex]!;
    if (!isReplacePatchOperationCandidate(op) || op.path === "") return null;
    const knownIndex = parseKnownArrayFieldIndex(op.path, fieldText);
    const location = knownIndex === null
      ? parseArrayFieldPath(op.path)
      : { arrayPath, index: knownIndex, key: field };
    if (location === null || location.arrayPath !== arrayPath || location.key !== field) return null;
    operations[opIndex] = { op: "replace", path: op.path, index: location.index, value: op.value };
  }
  return operations;
}

export function planSameArrayNestedReplacePatch(input: {
  state: unknown;
  operations: ReadonlyArray<JSONPatchOperation>;
}): SameArrayNestedReplacePatchPlan | null {
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length < 2) return null;
  if (!(0 in ops)) return null;
  const first = ops[0]!;
  if (!isReplacePatchOperationCandidate(first) || first.path === "") return null;

  const firstLocation = parseFirstArrayNestedPath(input.state, first.path);
  if (firstLocation === null) return null;
  const operations = planSameArrayNestedReplaceOperations(
    ops,
    firstLocation.arrayPath,
    firstLocation.suffixSegments,
    firstLocation.prefixText,
    firstLocation.suffixText,
  );
  return operations === null
    ? null
    : { arrayPath: firstLocation.arrayPath, arraySegments: firstLocation.arraySegments, suffixSegments: firstLocation.suffixSegments, operations };
}

export function planSameArrayNestedReplaceOperations(
  ops: ReadonlyArray<JSONPatchOperation>,
  arrayPath: Pointer,
  suffixSegments: string[],
  prefixText: string,
  suffixText: string,
): SameArrayNestedReplaceOperationPlan[] | null {
  if (!Array.isArray(ops) || ops.length < 2) return null;
  const operations = new Array<SameArrayNestedReplaceOperationPlan>(ops.length);
  for (let opIndex = 0; opIndex < ops.length; opIndex += 1) {
    if (!(opIndex in ops)) return null;
    const op = ops[opIndex]!;
    if (!isReplacePatchOperationCandidate(op) || op.path === "") return null;
    const index = parseKnownArrayNestedIndex(op.path, arrayPath, suffixSegments, prefixText, suffixText);
    if (index === null) return null;
    operations[opIndex] = { op: "replace", path: op.path, index, value: op.value };
  }
  return operations;
}

export function isReplacePatchOperationCandidate(
  op: JSONPatchOperation,
): op is Extract<JSONPatchOperation, { op: "replace" }> {
  return !!op
    && typeof op === "object"
    && validateOperationShape(op) === null
    && op.op === "replace"
    && typeof op.path === "string";
}

export function applySingleArrayFieldReplace(input: {
  state: unknown;
  path: Pointer;
  value: unknown;
}): unknown | null {
  const { state, path, value } = input;
  const plan = planSingleArrayFieldReplace({ path, value });
  if (plan === null) return null;

  const rootArrayReplace = applySingleRootArrayFieldReplace({ state, ...plan });
  if (rootArrayReplace !== null) return rootArrayReplace;
  return applyArrayFieldReplaceAtPointer({ state, ...plan });
}

export function applyArrayFieldReplaceAtPointer(input: {
  state: unknown;
  arrayPath: Pointer;
  index: number;
  key: string;
  value: unknown;
}): unknown | null {
  const { state, arrayPath, index, key, value } = input;
  let arraySegments: string[];
  try {
    arraySegments = parsePointer(arrayPath);
  } catch {
    return null;
  }

  const current = readArrayAtSegments(state, arraySegments);
  if (!current.ok) return null;
  const nextArray = replaceArrayField(current.array, index, key, value);
  return nextArray === null ? null : replaceValueAtSegments(state, arraySegments, 0, nextArray);
}

export function applySingleRootArrayFieldReplace(input: {
  state: unknown;
  arrayPath: Pointer;
  index: number;
  key: string;
  value: unknown;
}): unknown | null {
  const { state, arrayPath, index, key, value } = input;
  const target = readSingleRootArrayFieldTarget(state, arrayPath);
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

export function evaluateArrayIndexReplaceValues<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(input: {
  state: z.output<S>;
  array: ReadonlyArray<unknown>;
  operations: ReadonlyArray<Operation>;
  valueSchema: z.ZodType;
  valuesTrusted: boolean;
  replacementValue: (operation: Operation, currentValue: unknown) => ArrayReplacementValueResult;
}): { ok: true; replacements: ArrayIndexReplacement[] } | { ok: false; result: ApplyResult<S> | null } {
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
>(input: {
  state: z.output<S>;
  arraySegments: ReadonlyArray<string>;
  array: ReadonlyArray<unknown>;
  operations: ReadonlyArray<Operation>;
  valueSchema: z.ZodType;
  valuesTrusted: boolean;
  replacementValue: (operation: Operation, currentValue: unknown) => ArrayReplacementValueResult;
}): ApplyResult<S> | null {
  const replacements = evaluateArrayIndexReplaceValues(input);
  if (!replacements.ok) return replacements.result;
  const nextState = applyArrayIndexReplacements({
    state: input.state,
    arraySegments: input.arraySegments,
    array: input.array,
    replacements: replacements.replacements,
  });
  return nextState === null ? null : okLocalSchemaValidation(nextState as z.output<S>, toAppliedReplaceOperations(input.operations));
}

export function applyValidatedArrayFieldReplacementsAtSegments<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(input: {
  state: z.output<S>;
  arraySegments: ReadonlyArray<string>;
  field: string;
  operations: ReadonlyArray<Operation>;
  valueSchema: z.ZodType;
  valuesTrusted: boolean;
}): ApplyResult<S> | null {
  const current = readArrayAtSegments(input.state, input.arraySegments);
  if (!current.ok) return null;
  return applyValidatedArrayIndexReplacements({
    state: input.state,
    arraySegments: input.arraySegments,
    array: current.array,
    operations: input.operations,
    valueSchema: input.valueSchema,
    valuesTrusted: input.valuesTrusted,
    replacementValue: (op, currentValue) => {
      const replaced = replaceObjectDataValue(currentValue, input.field, op.value);
      return replaced === null ? { ok: false } : { ok: true, value: replaced };
    },
  });
}

export function applyValidatedArrayNestedValueReplacementsAtSegments<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(input: {
  state: z.output<S>;
  arraySegments: ReadonlyArray<string>;
  suffixSegments: ReadonlyArray<string>;
  operations: ReadonlyArray<Operation>;
  valueSchema: z.ZodType;
  valuesTrusted: boolean;
}): ApplyResult<S> | null {
  const current = readArrayAtSegments(input.state, input.arraySegments);
  if (!current.ok) return null;
  const replacements = evaluateArrayIndexReplaceValues({
    state: input.state,
    array: current.array,
    operations: input.operations,
    valueSchema: input.valueSchema,
    valuesTrusted: input.valuesTrusted,
    replacementValue: (op) => ({ ok: true, value: op.value }),
  });
  if (!replacements.ok) return replacements.result;
  const nextState = applyArrayNestedReplacements({
    state: input.state,
    arraySegments: input.arraySegments,
    array: current.array,
    suffixSegments: input.suffixSegments,
    replacements: replacements.replacements,
  });
  return nextState === null ? null : okLocalSchemaValidation(nextState as z.output<S>, toAppliedReplaceOperations(input.operations));
}

export function applyKnownJsonArrayIndexReplacementsAtSegments<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(input: {
  state: z.output<S>;
  schema: z.ZodType;
  arraySegments: ReadonlyArray<string>;
  operations: ReadonlyArray<Operation>;
}): ApplyResult<S> | null {
  const current = readArrayAtSegments(input.state, input.arraySegments);
  if (!current.ok) return null;
  const valueValidator = knownJsonValueValidatorForSchema(input.schema);
  const replacements = new Array<ArrayIndexReplacement>(input.operations.length);
  for (let opIndex = 0; opIndex < input.operations.length; opIndex += 1) {
    const op = input.operations[opIndex]!;
    if (op.index < 0 || op.index >= current.array.length) return null;
    if (!acceptsKnownJsonValueWithValidator(valueValidator, op.value)) return null;
    replacements[opIndex] = { index: op.index, value: op.value };
  }
  const nextState = applyArrayIndexReplacements({ state: input.state, arraySegments: input.arraySegments, array: current.array, replacements });
  return nextState === null ? null : okLocalSchemaValidation(nextState as z.output<S>, toAppliedReplaceOperations(input.operations));
}

export function applyArrayIndexReplacements(input: {
  state: unknown;
  arraySegments: ReadonlyArray<string>;
  array: ReadonlyArray<unknown>;
  replacements: ReadonlyArray<ArrayIndexReplacement>;
}): unknown | null {
  const next = input.array.slice();
  for (const replacement of input.replacements) {
    if (replacement.index < 0 || replacement.index >= next.length) return null;
    next[replacement.index] = replacement.value;
  }
  return replaceValueAtSegments(input.state, input.arraySegments, 0, next);
}

export function applyArrayNestedReplacements(input: {
  state: unknown;
  arraySegments: ReadonlyArray<string>;
  array: ReadonlyArray<unknown>;
  suffixSegments: ReadonlyArray<string>;
  replacements: ReadonlyArray<ArrayIndexReplacement>;
}): unknown | null {
  const rowReplacements = new Array<ArrayIndexReplacement>(input.replacements.length);
  for (let index = 0; index < input.replacements.length; index += 1) {
    const replacement = input.replacements[index]!;
    if (replacement.index < 0 || replacement.index >= input.array.length) return null;
    const replaced = replaceValueAtSegments(input.array[replacement.index], input.suffixSegments, 0, replacement.value);
    if (replaced === null) return null;
    rowReplacements[index] = { index: replacement.index, value: replaced };
  }
  return applyArrayIndexReplacements({
    state: input.state,
    arraySegments: input.arraySegments,
    array: input.array,
    replacements: rowReplacements,
  });
}

function readSingleRootArrayFieldTarget(state: unknown, arrayPath: Pointer):
  | { kind: "root"; array: unknown[] }
  | { kind: "property"; source: Record<string, unknown>; key: string; array: unknown[] }
  | null {
  if (arrayPath === "") return Array.isArray(state) ? { kind: "root", array: state } : null;
  if (arrayPath[0] !== "/" || arrayPath.includes("~") || arrayPath.indexOf("/", 1) !== -1) return null;
  const arrayKey = arrayPath.slice(1);
  if (arrayKey === "__proto__") return null;
  if (state === null || typeof state !== "object" || Array.isArray(state)) return null;
  const source = state as Record<string, unknown>;
  const current = source[arrayKey];
  return Array.isArray(current) ? { kind: "property", source, key: arrayKey, array: current } : null;
}
