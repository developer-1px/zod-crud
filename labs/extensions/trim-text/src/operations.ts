import type { JSONDocument, Pointer } from "@interactive-os/json-document";
import { canTrimText } from "./plan.js";
import type { TrimTextOptions, TrimTextResult } from "./types.js";

export function trimText<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  maxLength: number,
  options?: TrimTextOptions,
): TrimTextResult {
  const change = canTrimText(doc, pointer, maxLength, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `trim-text patch failed at ${pointer}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
