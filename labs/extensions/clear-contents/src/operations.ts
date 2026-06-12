import type { JSONDocument, Pointer } from "@interactive-os/json-document";
import { canClearContents } from "./plan.js";
import type { ClearContentsOptions, ClearContentsResult } from "./types.js";

export function clearContents<TDocument>(
  doc: JSONDocument<TDocument>,
  targets: ReadonlyArray<Pointer>,
  options?: ClearContentsOptions,
): ClearContentsResult {
  const change = canClearContents(doc, targets, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? "clear-contents patch failed",
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
