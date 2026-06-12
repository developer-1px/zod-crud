import type { JSONDocument, Pointer } from "@interactive-os/json-document";
import { canSplit } from "./plan.js";
import type { SplitTextOptions, SplitTextResult } from "./types.js";

export function split<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  text: string,
  options?: SplitTextOptions,
): SplitTextResult {
  const change = canSplit(doc, path, text, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `split-text patch failed at ${path}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
