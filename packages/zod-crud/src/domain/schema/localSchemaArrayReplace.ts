import type * as z from "zod";
import type { ApplyResult, JSONPatchOperation } from "../../foundation/json-patch/types.js";
import {
  arrayElementSchemaAtParent,
  cachedSchemaAtPointer,
} from "./localSchemaInfo.js";
import {
  applyKnownJsonArrayIndexReplacementsAtSegments,
  applySingleArrayFieldReplace,
  applyValidatedArrayFieldReplacementsAtSegments,
  applyValidatedArrayNestedValueReplacementsAtSegments,
} from "./localSchemaArrayReplaceApply.js";
import {
  planSameArrayElementReplacePatch,
  planSameArrayFieldReplacePatch,
  planSameArrayNestedReplacePatch,
} from "./localSchemaArrayReplacePlan.js";

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
