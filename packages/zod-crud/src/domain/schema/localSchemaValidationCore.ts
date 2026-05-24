import type * as z from "zod";
import type { ApplyResult, JSONPatchOperation } from "../../foundation/json-patch/index.js";
import {
  applyAppendOnlyAddPatchWithLocalSchemaValidation,
  applyIncreasingArrayAddPatchWithLocalSchemaValidation,
} from "./localSchemaArrayAdd.js";
import {
  applyKnownJsonSameArrayElementReplacePatchWithLocalSchemaValidation,
  applySameArrayFieldReplacePatchWithLocalSchemaValidation,
  applySameArrayNestedReplacePatchWithLocalSchemaValidation,
} from "./localSchemaArrayReplace.js";
import { isPlainStructuralSchema } from "./localSchemaInfo.js";
import {
  applyReplacePatchWithLocalSchemaValidation,
  applySingleReplacePatchWithLocalSchemaValidation,
  planIndependentReplacePatch,
} from "./localSchemaReplace.js";
import {
  applyRootRecordAddPatchWithLocalSchemaValidation,
  applyRootRecordRemovePatchWithLocalSchemaValidation,
} from "./localSchemaRootRecord.js";
import { applyRootObjectReplacePatchWithLocalSchemaValidation } from "./localSchemaRootReplace.js";
import { applySameArrayPatchWithLocalSchemaValidation } from "./localSchemaSameArray.js";
import { applySequentialPatchWithLocalSchemaValidation } from "./localSchemaSequential.js";

export type LocalSchemaValidationResult<S extends z.ZodType> = ApplyResult<S> | null;

export interface LocalSchemaValidationOptions {
  valuesTrusted?: boolean;
}

export function applyPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  options: LocalSchemaValidationOptions = {},
): LocalSchemaValidationResult<S> {
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
  if (planIndependentReplacePatch(ops)) return applyReplacePatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);

  const appendOnlyAdd = applyAppendOnlyAddPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (appendOnlyAdd) return appendOnlyAdd;
  const increasingAdd = applyIncreasingArrayAddPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (increasingAdd) return increasingAdd;
  const arrayBatch = applySameArrayPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (arrayBatch) return arrayBatch;
  return applySequentialPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
}
