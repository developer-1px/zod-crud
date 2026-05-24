import type * as z from "zod";
import type { ApplyResult } from "../../foundation/json-patch/index.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import {
  acceptsKnownJsonValueWithValidator,
  knownJsonValueValidatorForSchema,
} from "./localSchemaKnownJson.js";
import { objectHasOwn, replaceObjectDataValue } from "./localSchemaObject.js";
import {
  applyArrayIndexReplacements,
  applyArrayNestedReplacements,
  applyKnownJsonArrayIndexReplacementsAtSegments as applyKnownJsonArrayIndexReplacementsAtSegmentsRaw,
  applyValidatedArrayIndexReplacements,
  evaluateArrayIndexReplaceValues,
  type ArrayIndexReplacement,
  type ArrayReplacementValueResult,
  type IndexedReplaceValueValidationOperation,
} from "./localSchemaArrayReplaceApply.js";
import { okLocalSchemaValidation } from "./localSchemaResult.js";
import { toAppliedReplaceOperations } from "./localSchemaValueValidation.js";

export function readSingleRootArrayFieldTarget(input: { state: unknown; arrayPath: Pointer }):
  | { kind: "root"; array: unknown[] }
  | { kind: "property"; source: Record<string, unknown>; key: string; array: unknown[] }
  | null {
  if (input.arrayPath === "") return Array.isArray(input.state) ? { kind: "root", array: input.state } : null;
  if (input.arrayPath[0] !== "/" || input.arrayPath.includes("~") || input.arrayPath.indexOf("/", 1) !== -1) return null;
  const key = input.arrayPath.slice(1);
  if (key === "__proto__" || input.state === null || typeof input.state !== "object" || Array.isArray(input.state)) return null;
  const source = input.state as Record<string, unknown>;
  if (!objectHasOwn.call(source, key)) return null;
  const array = source[key];
  return Array.isArray(array) ? { kind: "property", source, key, array } : null;
}

export function buildValidatedArrayIndexReplacements<
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
  return evaluateArrayIndexReplaceValues(input);
}

export function applyValidatedArrayFieldReplacements<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(input: {
  state: z.output<S>;
  arraySegments: ReadonlyArray<string>;
  array: ReadonlyArray<unknown>;
  field: string;
  operations: ReadonlyArray<Operation>;
  valueSchema: z.ZodType;
  valuesTrusted: boolean;
}): ApplyResult<S> | null {
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

export function applyValidatedArrayNestedReplacements<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(input: {
  state: z.output<S>;
  arraySegments: ReadonlyArray<string>;
  array: ReadonlyArray<unknown>;
  suffixSegments: ReadonlyArray<string>;
  operations: ReadonlyArray<Operation>;
  valueSchema: z.ZodType;
  valuesTrusted: boolean;
  replacementValue: (operation: Operation, currentValue: unknown) => ArrayReplacementValueResult;
}): ApplyResult<S> | null {
  const replacements = buildValidatedArrayIndexReplacements(input);
  if (!replacements.ok) return replacements.result;
  const nextState = applyArrayNestedReplacements({
    state: input.state,
    arraySegments: input.arraySegments,
    array: input.array,
    suffixSegments: input.suffixSegments,
    replacements: replacements.replacements,
  });
  return nextState === null ? null : okLocalSchemaValidation(nextState as z.output<S>, toAppliedReplaceOperations(input.operations));
}

export function applyValidatedArrayNestedValueReplacements<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(input: {
  state: z.output<S>;
  arraySegments: ReadonlyArray<string>;
  array: ReadonlyArray<unknown>;
  suffixSegments: ReadonlyArray<string>;
  operations: ReadonlyArray<Operation>;
  valueSchema: z.ZodType;
  valuesTrusted: boolean;
}): ApplyResult<S> | null {
  return applyValidatedArrayNestedReplacements({ ...input, replacementValue: (op) => ({ ok: true, value: op.value }) });
}

export function buildKnownJsonArrayIndexReplacements<
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(input: {
  schema: z.ZodType;
  array: ReadonlyArray<unknown>;
  operations: ReadonlyArray<Operation>;
}): ArrayIndexReplacement[] | null {
  const valueValidator = knownJsonValueValidatorForSchema(input.schema);
  const replacements = new Array<ArrayIndexReplacement>(input.operations.length);
  for (let index = 0; index < input.operations.length; index += 1) {
    const op = input.operations[index]!;
    if (op.index < 0 || op.index >= input.array.length) return null;
    if (!acceptsKnownJsonValueWithValidator(valueValidator, op.value)) return null;
    replacements[index] = { index: op.index, value: op.value };
  }
  return replacements;
}

export function applyKnownJsonArrayIndexReplacements<
  S extends z.ZodType,
  Operation extends IndexedReplaceValueValidationOperation = IndexedReplaceValueValidationOperation,
>(input: {
  state: z.output<S>;
  schema: z.ZodType;
  arraySegments: ReadonlyArray<string>;
  array: ReadonlyArray<unknown>;
  operations: ReadonlyArray<Operation>;
}): ApplyResult<S> | null {
  const replacements = buildKnownJsonArrayIndexReplacements(input);
  if (replacements === null) return null;
  const nextState = applyArrayIndexReplacements({
    state: input.state,
    arraySegments: input.arraySegments,
    array: input.array,
    replacements,
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
  return applyKnownJsonArrayIndexReplacementsAtSegmentsRaw(input);
}
