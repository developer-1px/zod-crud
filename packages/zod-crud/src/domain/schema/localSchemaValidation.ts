export {
  applyPatchWithLocalSchemaValidation,
  type LocalSchemaValidationOptions,
  type LocalSchemaValidationResult,
} from "./localSchemaValidationCore.js";
export {
  isPlainStructuralSchemaForLocalValidation,
  schemaOutputIsKnownJson,
} from "./localSchemaInfo.js";
export {
  applyArrayAddPlan,
  applyValidatedArrayAddPlan,
  applyValidatedArrayAddPlanAtSegments,
  evaluateArrayAddElementValues,
  planAppendOnlyArrayAddPatch,
  planAppendOnlyArrayAddValues,
  planIncreasingArrayAddPatch,
  planIncreasingArrayAddValues,
} from "./localSchemaCompatArrayAdd.js";
export {
  applyKnownJsonArrayIndexReplacements,
  applyKnownJsonArrayIndexReplacementsAtSegments,
  applyValidatedArrayFieldReplacements,
  applyValidatedArrayNestedReplacements,
  applyValidatedArrayNestedValueReplacements,
  buildKnownJsonArrayIndexReplacements,
  buildValidatedArrayIndexReplacements,
  readSingleRootArrayFieldTarget,
} from "./localSchemaCompatArrayReplace.js";
export {
  planSameArrayElementReplaceOperations,
  planSameArrayFieldReplaceOperations,
  planSameArrayNestedReplaceOperations,
  planSameArrayPatch,
  planSameArrayPatchOperations,
} from "./localSchemaCompatPlans.js";
export {
  applyKnownJsonReplaceOperations,
  applyReplaceOperations,
  applySingleReplaceOperation,
  evaluateAppliedReplaceOperations,
  evaluateKnownJsonReplaceValues,
  planAppliedReplaceValueValidation,
  planIndependentReplacePatch,
  planIndependentReplacePaths,
  planKnownJsonReplaceOperations,
  planKnownJsonReplacePatch,
  planSingleReplacePatch,
} from "./localSchemaCompatReplace.js";
export {
  applyRootObjectReplacePlan,
  applyRootRecordAddPlan,
  applyRootRecordRemovePlan,
  applySingleRootObjectReplacePlan,
  evaluateRootObjectReplaceValues,
  evaluateRootRecordAddValues,
  planRootObjectReplaceOperations,
  planRootObjectReplacePatch,
  planRootObjectReplaceStrategy,
  planRootObjectReplaceValueValidation,
  planRootRecordAddOperations,
  planRootRecordAddPatch,
  planRootRecordAddValueValidation,
  planRootRecordRemoveOperations,
  planRootRecordRemovePatch,
  planRootRecordRemoveStrategy,
  planSingleRootObjectReplacePatch,
  readRootRecordForLocalSchemaValidation,
} from "./localSchemaCompatRoot.js";
export {
  applySequentialLocalOperation,
  applySequentialLocalOperationPatch,
  applySequentialLocalOperations,
  planAppliedLocalOpValidation,
  planSequentialPatch,
  readAppliedLocalOpSourceValue,
  readArrayAtSegments,
  readFirstArrayNestedPath,
} from "./localSchemaCompatSequential.js";
export * from "./localSchemaArrayAdd.js";
export * from "./localSchemaArrayReplace.js";
export * from "./localSchemaArrayReplaceApply.js";
export * from "./localSchemaArrayReplacePlan.js";
export * from "./localSchemaInfo.js";
export * from "./localSchemaKnownJson.js";
export * from "./localSchemaObject.js";
export * from "./localSchemaPath.js";
export * from "./localSchemaReplace.js";
export * from "./localSchemaResult.js";
export * from "./localSchemaRootRecord.js";
export * from "./localSchemaRootReplace.js";
export * from "./localSchemaSameArray.js";
export * from "./localSchemaSequential.js";
export * from "./localSchemaValidationCore.js";
export * from "./localSchemaValueValidation.js";
