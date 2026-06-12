import type { JSONDocument, Pointer } from "@interactive-os/json-document";
import { canRound } from "./plan.js";
import type { RoundOptions, RoundResult } from "./types.js";

export function round<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  options?: RoundOptions,
): RoundResult {
  const change = canRound(doc, pointer, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `round patch failed at ${pointer}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
