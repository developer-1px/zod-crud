import type { JSONDocument, Pointer } from "@interactive-os/json-document";
import { canLimitItems } from "./plan.js";
import type { LimitItemsOptions, LimitItemsResult } from "./types.js";

export function limitItems<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  max: number,
  options?: LimitItemsOptions,
): LimitItemsResult<TValue> {
  const change = canLimitItems<TDocument, TValue>(doc, path, max, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `limit patch failed at ${path}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
