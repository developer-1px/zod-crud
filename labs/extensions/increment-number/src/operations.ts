import type { JSONDocument, Pointer } from "@interactive-os/json-document";
import { canStep } from "./plan.js";
import type { IncrementNumberOptions, IncrementNumberResult } from "./types.js";

export function step<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  options?: IncrementNumberOptions,
): IncrementNumberResult {
  const change = canStep(doc, pointer, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `increment-number patch failed at ${pointer}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
