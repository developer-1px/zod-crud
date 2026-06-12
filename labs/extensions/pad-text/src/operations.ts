import type { JSONDocument, Pointer } from "@interactive-os/json-document";
import { canPadText } from "./plan.js";
import type { PadTextOptions, PadTextResult } from "./types.js";

export function padText<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  length: number,
  options?: PadTextOptions,
): PadTextResult {
  const change = canPadText(doc, pointer, length, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `pad patch failed at ${pointer}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
