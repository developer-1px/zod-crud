import type { JSONDocument, Pointer } from "zod-crud";
import { canJoin } from "./plan.js";
import type { JoinTextOptions, JoinTextResult } from "./types.js";

export function join<TDocument>(
  doc: JSONDocument<TDocument>,
  source: Pointer,
  target: Pointer,
  options?: JoinTextOptions,
): JoinTextResult {
  const change = canJoin(doc, source, target, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `join-text patch failed at ${target}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
