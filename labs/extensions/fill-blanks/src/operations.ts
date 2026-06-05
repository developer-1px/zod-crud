import type { JSONDocument, Pointer } from "zod-crud";
import { canFillBlanks } from "./plan.js";
import type { FillBlanksOptions, FillBlanksResult, FillBlanksValue } from "./types.js";

export function fillBlanks<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  targets: ReadonlyArray<Pointer>,
  value: FillBlanksValue<TValue>,
  options?: FillBlanksOptions,
): FillBlanksResult {
  const change = canFillBlanks(doc, targets, value, options);
  if (!change.ok) return change;
  if (change.operations.length === 0) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? "fill-blanks patch failed",
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
