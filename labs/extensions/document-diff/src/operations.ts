import type { JSONChangeMetadata, JSONDocument } from "@interactive-os/json-document";
import { diffDocument } from "./plan.js";
import type { DocumentDiffApplyResult } from "./types.js";

export function applyDocumentDiff<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  target: TValue,
  metadata?: JSONChangeMetadata,
): DocumentDiffApplyResult<TValue> {
  const change = diffDocument(doc, target);
  if (!change.ok) return change;
  if (change.operations.length === 0) return change;

  const patched = doc.patch(change.operations, metadata);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? "document diff patch failed",
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
