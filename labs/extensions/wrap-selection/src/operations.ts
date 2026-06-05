import type { JSONDocument, JSONResult, Pointer } from "zod-crud";
import { canUnwrapSelection, canWrapSelection, wrapSelectionError } from "./plan.js";
import type { WrapSelectionAdapter, WrapSelectionApplyResult, WrapSelectionError, WrapSelectionOperation, WrapSource } from "./types.js";

export function wrapSelection<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: WrapSelectionAdapter,
  source: WrapSource,
): WrapSelectionApplyResult {
  const change = canWrapSelection(doc, adapter, source);
  if (!change.ok) return change;

  const result = doc.patch(change.operations);
  if (!result.ok) return patchError("wrap", change.parent, result);

  return {
    ...change,
    result,
  };
}

export function unwrapSelection<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: WrapSelectionAdapter,
  source: Pointer,
): WrapSelectionApplyResult {
  const change = canUnwrapSelection(doc, adapter, source);
  if (!change.ok) return change;

  const result = doc.patch(change.operations);
  if (!result.ok) return patchError("unwrap", change.parent, result);

  return {
    ...change,
    result,
  };
}

function patchError(
  operation: WrapSelectionOperation,
  parent: Pointer,
  result: Exclude<JSONResult, { ok: true }>,
): WrapSelectionError {
  const error = wrapSelectionError("patch_failed", result.reason ?? "wrap/unwrap patch failed", result.pointer, {
    operation,
    parent,
  });
  error.result = result;
  return error;
}
