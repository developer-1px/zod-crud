import type { JSONChangeMetadata, JSONDocument, JSONResult } from "zod-crud";
import { canFillGridRange, canPasteGridRange } from "./plan.js";
import type { GridRangeError, GridRangeFillInput, GridRangeOptions, GridRangePasteInput, GridRangeResult } from "./types.js";

export function pasteGridRange<TDocument>(
  doc: JSONDocument<TDocument>,
  input: GridRangePasteInput,
  options: GridRangeOptions = {},
  metadata?: JSONChangeMetadata,
): GridRangeResult {
  const change = canPasteGridRange(doc, input, options);
  if (!change.ok) return change;
  if (!change.changed) return change;

  const patched = doc.patch(change.operations, metadata);
  if (!patched.ok) return patchError(patched);
  return change;
}

export function fillGridRange<TDocument>(
  doc: JSONDocument<TDocument>,
  input: GridRangeFillInput,
  options: GridRangeOptions = {},
  metadata?: JSONChangeMetadata,
): GridRangeResult {
  const change = canFillGridRange(doc, input, options);
  if (!change.ok) return change;
  if (!change.changed) return change;

  const patched = doc.patch(change.operations, metadata);
  if (!patched.ok) return patchError(patched);
  return change;
}

function patchError(patch: Extract<JSONResult, { ok: false }>): GridRangeError {
  return {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? "grid-range patch failed",
    patch,
    ...(patch.pointer === undefined ? {} : { pointer: patch.pointer }),
  };
}
