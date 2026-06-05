import type { JSONDocument, Pointer } from "zod-crud";
import { canSwapItems } from "./plan.js";
import type { SwapItemsResult } from "./types.js";

export function swapItems<TDocument>(doc: JSONDocument<TDocument>, a: Pointer, b: Pointer): SwapItemsResult {
  const change = canSwapItems(doc, a, b);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `swapItems patch failed at ${change.path}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
