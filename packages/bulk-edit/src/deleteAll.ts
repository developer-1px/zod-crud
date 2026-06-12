import type {
  JSONChangeMetadata,
  JSONDocument,
  JSONPatchOperation,
} from "@interactive-os/json-document";

import {
  patchError,
} from "./errors.js";
import {
  changeWithCapability,
  comparePatchPointerOrder,
  queryPointers,
} from "./matches.js";
import type {
  BulkEditChangeResult,
  BulkEditResult,
} from "./types.js";

export function canDeleteAll<TDocument>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
): BulkEditChangeResult {
  const pointers = queryPointers(doc, jsonPath);
  if (!pointers.ok) return pointers;

  const sorted = [...pointers.pointers]
    .sort(comparePatchPointerOrder);
  const operations = sorted.map<JSONPatchOperation>((path) => ({
    op: "remove",
    path,
  }));

  return changeWithCapability(doc, jsonPath, sorted, operations);
}

export function deleteAll<TDocument>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
  metadata?: JSONChangeMetadata,
): BulkEditResult {
  const change = canDeleteAll(doc, jsonPath);
  if (!change.ok) return change;

  const patched = doc.patch(change.operations, metadata);
  if (!patched.ok) return patchError(jsonPath, patched);
  return change;
}
