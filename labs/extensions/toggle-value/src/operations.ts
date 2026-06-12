import type { JSONDocument, Pointer } from "@interactive-os/json-document";
import { canToggleValue } from "./plan.js";
import type { ToggleValueOptions, ToggleValueResult } from "./types.js";

export function toggleValue<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  options?: ToggleValueOptions<TValue>,
): ToggleValueResult<TValue> {
  const change = canToggleValue(doc, pointer, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `toggle-value patch failed at ${pointer}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
