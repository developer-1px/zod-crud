import type { JSONDocument, Pointer } from "zod-crud";
import { canFillDown } from "./plan.js";
import type { FillDownOptions, FillDownResult } from "./types.js";

export function fillDown<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  options?: FillDownOptions,
): FillDownResult {
  const change = canFillDown(doc, path, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `fill-down patch failed at ${path}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
