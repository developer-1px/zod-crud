import type { JSONChangeMetadata, JSONDocument } from "@interactive-os/json-document";
import { canEditSparseRecords } from "./plan.js";
import type { SparseRecordEdit, SparseRecordOptions, SparseRecordResult } from "./types.js";

export function editSparseRecords<TDocument>(
  doc: JSONDocument<TDocument>,
  edits: SparseRecordEdit | ReadonlyArray<SparseRecordEdit>,
  options: SparseRecordOptions = {},
  metadata?: JSONChangeMetadata,
): SparseRecordResult {
  const change = canEditSparseRecords(doc, edits, options);
  if (!change.ok) return change;
  if (change.operations.length === 0) return change;

  const patched = doc.patch(change.operations, metadata);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? "sparse-record patch failed",
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
