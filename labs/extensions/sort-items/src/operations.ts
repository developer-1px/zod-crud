import type { JSONDocument, Pointer } from "zod-crud";
import { canReverse, canSort } from "./plan.js";
import type { SortItemsChange, SortItemsCompare, SortItemsResult } from "./types.js";

export function sort<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  compare: SortItemsCompare<TValue>,
): SortItemsResult<TValue> {
  const change = canSort(doc, path, compare);
  if (!change.ok) return change;
  return applyChange(doc, change);
}

export function reverse<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
): SortItemsResult<TValue> {
  const change = canReverse<TDocument, TValue>(doc, path);
  if (!change.ok) return change;
  return applyChange(doc, change);
}

function applyChange<TDocument, TValue>(
  doc: JSONDocument<TDocument>,
  change: SortItemsChange<TValue>,
): SortItemsResult<TValue> {
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `collection sort patch failed for ${change.path}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
