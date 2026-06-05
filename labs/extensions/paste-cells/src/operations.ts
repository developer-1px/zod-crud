import type { JSONDocument } from "zod-crud";
import { canPasteGrid } from "./plan.js";
import type { PasteCellsResult, PasteCellsTarget } from "./types.js";

export function pasteGrid<TDocument>(
  doc: JSONDocument<TDocument>,
  target: PasteCellsTarget,
  matrix: ReadonlyArray<ReadonlyArray<unknown>>,
): PasteCellsResult {
  const change = canPasteGrid(doc, target, matrix);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `grid paste patch failed at ${change.path}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
