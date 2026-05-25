import type { JSONPatchOperation } from "../../foundation/json-patch/types.js";
import { validateOperationShape } from "../../foundation/json-patch/apply.js";
import {
  arrayFieldText,
  parseArrayFieldPath,
  parseFirstArrayNestedPath,
  parseKnownArrayFieldIndex,
  parseKnownArrayNestedIndex,
} from "../../foundation/json-patch/path.js";
import type { ArrayFieldText } from "../../foundation/json-patch/types.js";
import { parsePointer, type Pointer } from "../../foundation/json-pointer/pointerCore.js";
import {
  arrayElementIndexPrefix,
  arrayElementReplaceLocation,
  parseKnownArrayElementReplaceIndex,
} from "./localSchemaPath.js";
import type { IndexedReplaceValueValidationOperation } from "./localSchemaValueValidation.js";

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
