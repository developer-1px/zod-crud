import type { JSONDocument, Pointer } from "zod-crud";
import { canBatchUpdate } from "./plan.js";
import type { BatchUpdateOptions, BatchUpdateResult, BatchUpdateValue } from "./types.js";

export function batchUpdate<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  targets: ReadonlyArray<Pointer>,
  value: BatchUpdateValue<TValue>,
  options?: BatchUpdateOptions,
): BatchUpdateResult {
  const change = canBatchUpdate(doc, targets, value, options);
  if (!change.ok) return change;
  if (change.operations.length === 0) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? "batch-update patch failed",
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
