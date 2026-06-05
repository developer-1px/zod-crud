import type { JSONDocument, JSONResult, Pointer } from "zod-crud";
import { canReorderLayers, layerOrderError } from "./plan.js";
import type { LayerOrderAction, LayerOrderApplyResult, LayerOrderError, LayerOrderSource } from "./types.js";

export function reorderLayers<TDocument>(
  doc: JSONDocument<TDocument>,
  source: LayerOrderSource,
  action: LayerOrderAction,
): LayerOrderApplyResult {
  const change = canReorderLayers(doc, source, action);
  if (!change.ok) return change;

  const result = doc.patch(change.operations);
  if (!result.ok) return patchError(change.parent, result);

  return {
    ...change,
    result,
  };
}

function patchError(
  parent: Pointer,
  result: Exclude<JSONResult, { ok: true }>,
): LayerOrderError {
  const error = layerOrderError("patch_failed", result.reason ?? "layer order patch failed", result.pointer, {
    parent,
  });
  error.result = result;
  return error;
}
