import type { JSONDocument, Pointer } from "@interactive-os/json-document";
import { canDedupe } from "./plan.js";
import type { DedupeOptions, DedupeResult } from "./types.js";

export function dedupe<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  options?: DedupeOptions<TValue>,
): DedupeResult<TValue> {
  const change = canDedupe(doc, path, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `dedupe patch failed at ${path}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
