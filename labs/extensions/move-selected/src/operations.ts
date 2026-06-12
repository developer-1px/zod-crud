import type { JSONDocument, Pointer } from "@interactive-os/json-document";
import { canMoveSelected } from "./plan.js";
import type { MoveSelectedResult, MoveSelectedTarget } from "./types.js";

export function moveSelected<TDocument>(
  doc: JSONDocument<TDocument>,
  source: ReadonlyArray<Pointer>,
  target: MoveSelectedTarget,
): MoveSelectedResult {
  const change = canMoveSelected(doc, source, target);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `move patch failed at ${change.path}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
