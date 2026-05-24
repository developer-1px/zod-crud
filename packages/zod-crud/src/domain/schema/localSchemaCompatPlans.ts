import type { JSONPatchOperation } from "../../foundation/json-patch/index.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import * as replacePlan from "./localSchemaArrayReplacePlan.js";
import * as sameArray from "./localSchemaSameArray.js";
import type { ArrayFieldText } from "./localSchemaPath.js";

export function planSameArrayPatch(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
}): sameArray.SameArrayPatchPlan | null {
  return sameArray.planSameArrayPatch(input.operations);
}

export function planSameArrayPatchOperations(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
  parent: Pointer;
}): sameArray.SameArrayPatchOperationPlan[] | null {
  return sameArray.planSameArrayPatchOperations(input.operations, input.parent);
}

export function planSameArrayElementReplaceOperations(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
  parent: Pointer;
}): replacePlan.SameArrayElementReplaceOperationPlan[] | null {
  return replacePlan.planSameArrayElementReplaceOperations(input.operations, input.parent);
}

export function planSameArrayFieldReplaceOperations(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
  arrayPath: Pointer;
  field: string;
  fieldText: ArrayFieldText;
}): replacePlan.SameArrayFieldReplaceOperationPlan[] | null {
  return replacePlan.planSameArrayFieldReplaceOperations(input.operations, input.arrayPath, input.field, input.fieldText);
}

export function planSameArrayNestedReplaceOperations(input: {
  operations: ReadonlyArray<JSONPatchOperation>;
  arrayPath: Pointer;
  suffixSegments: string[];
  prefixText: string;
  suffixText: string;
}): replacePlan.SameArrayNestedReplaceOperationPlan[] | null {
  return replacePlan.planSameArrayNestedReplaceOperations(
    input.operations,
    input.arrayPath,
    input.suffixSegments,
    input.prefixText,
    input.suffixText,
  );
}
