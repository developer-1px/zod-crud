import type * as z from "zod";
import type { ApplyResult } from "../../foundation/json-patch/types.js";
import { parsePointer, type Pointer } from "../../foundation/json-pointer/pointerCore.js";
import {
  acceptsKnownJsonValueWithValidator,
  knownJsonValueValidatorForSchema,
} from "./localSchemaKnownJson.js";
import { replaceObjectDataValue } from "./localSchemaObject.js";
import {
  readArrayAtSegments,
  replaceValueAtSegments,
} from "./localSchemaPath.js";
import { okLocalSchemaValidation } from "./localSchemaResult.js";
import {
  evaluateAppliedReplaceValueValidationPlan,
  toAppliedReplaceOperations,
} from "./localSchemaValueValidation.js";
import { planSingleArrayFieldReplace } from "./localSchemaArrayReplacePlan.js";
import type { IndexedReplaceValueValidationOperation } from "./localSchemaArrayReplaceTypes.js";

export interface ArrayIndexReplacement {
  index: number;
  value: unknown;
}

export type ArrayReplacementValueResult =
  | { ok: true; value: unknown }
  | { ok: false };

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
