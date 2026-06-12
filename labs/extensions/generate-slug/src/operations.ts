import type { JSONDocument, Pointer } from "@interactive-os/json-document";
import { canGenerateSlug } from "./plan.js";
import type { GenerateSlugOptions, GenerateSlugResult } from "./types.js";

export function generateSlug<TDocument>(
  doc: JSONDocument<TDocument>,
  source: Pointer,
  target: Pointer,
  options?: GenerateSlugOptions,
): GenerateSlugResult {
  const change = canGenerateSlug(doc, source, target, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `generate-slug patch failed at ${target}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
