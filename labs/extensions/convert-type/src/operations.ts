import type { JSONDocument, Pointer } from "zod-crud";
import { canConvertType } from "./plan.js";
import type { ConvertTypeResult, ConvertTypeTarget } from "./types.js";

export function convertType<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  to: ConvertTypeTarget,
): ConvertTypeResult {
  const change = canConvertType(doc, pointer, to);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `convert-type patch failed at ${pointer}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
