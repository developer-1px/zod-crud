import type { JSONChangeMetadata, JSONDocument, JSONPatchOperation, JSONResult } from "@interactive-os/json-document";
import { canConvertBlockType, cloneJson, conversionError } from "./plan.js";
import type { BlockTypeConversionDescriptor, BlockTypeConversionError, BlockTypeConversionInput, BlockTypeConversionPlan, BlockTypeConversionResult } from "./types.js";

export function convertBlockType<TDocument>(
  doc: JSONDocument<TDocument>,
  descriptor: BlockTypeConversionDescriptor,
  input: BlockTypeConversionInput,
  metadata?: JSONChangeMetadata,
): BlockTypeConversionResult {
  const plan = canConvertBlockType(doc, descriptor, input);
  if (!plan.ok) return plan;

  const result = doc.patch(plan.operation, metadata);
  if (!result.ok) return patchError(plan, result);

  return {
    ok: true,
    pointer: plan.pointer,
    from: plan.from,
    to: plan.to,
    operation: cloneJson(plan.operation) as JSONPatchOperation,
    result,
  };
}

function patchError(
  plan: BlockTypeConversionPlan,
  result: Exclude<JSONResult, { ok: true }>,
): BlockTypeConversionError {
  return conversionError("patch_failed", result.reason ?? "block type conversion patch failed", {
    pointer: result.pointer ?? plan.pointer,
    from: plan.from,
    to: plan.to,
    result: cloneJson(result) as Exclude<JSONResult, { ok: true }>,
  });
}
