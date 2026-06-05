import type { JSONDocument, Pointer } from "zod-crud";
import { canEnsure } from "./plan.js";
import type { ApplyDefaultsResult } from "./types.js";

export function ensure<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  defaults: Readonly<Record<string, unknown>>,
): ApplyDefaultsResult {
  const change = canEnsure(doc, path, defaults);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `apply-defaults patch failed at ${path}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
