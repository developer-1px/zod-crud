import type { JSONDocument } from "zod-crud";
import { editSparseRecords } from "./operations.js";
import { canEditSparseRecords } from "./plan.js";
import type { SparseRecord } from "./types.js";

export function createSparseRecord<TDocument>(doc: JSONDocument<TDocument>): SparseRecord<TDocument> {
  return {
    canEdit: (edits, options) => canEditSparseRecords(doc, edits, options),
    edit: (edits, options, metadata) => editSparseRecords(doc, edits, options, metadata),
  };
}
