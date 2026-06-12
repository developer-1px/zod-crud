import type { JSONDocument, Pointer } from "@interactive-os/json-document";
import { canTransform } from "./plan.js";
import type { CaseTransform, ChangeCaseResult } from "./types.js";

export function applyTransform<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  transform: CaseTransform,
): ChangeCaseResult {
  const change = canTransform(doc, pointer, transform);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `change-case patch failed at ${pointer}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
