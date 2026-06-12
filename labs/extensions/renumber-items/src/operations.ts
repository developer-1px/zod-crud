import type { JSONDocument, Pointer } from "@interactive-os/json-document";
import { canRenumberItems } from "./plan.js";
import type { RenumberItemsOptions, RenumberItemsResult } from "./types.js";

export function renumberItems<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  options?: RenumberItemsOptions,
): RenumberItemsResult {
  const change = canRenumberItems(doc, path, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `renumber-items patch failed at ${path}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
