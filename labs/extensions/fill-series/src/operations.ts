import type { JSONDocument, Pointer } from "zod-crud";
import { canFill } from "./plan.js";
import type { FillOptions, FillSeriesResult, FillSource } from "./types.js";

export function fill<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  target: ReadonlyArray<Pointer>,
  source: FillSource<TValue>,
  options?: FillOptions,
): FillSeriesResult<TValue> {
  const change = canFill(doc, target, source, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `fill patch failed at ${change.path}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
