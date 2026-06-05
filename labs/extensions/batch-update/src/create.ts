import type { JSONDocument } from "zod-crud";
import { batchUpdate } from "./operations.js";
import { canBatchUpdate } from "./plan.js";
import type { BatchUpdate } from "./types.js";

export function createBatchUpdate<TDocument>(doc: JSONDocument<TDocument>): BatchUpdate<TDocument> {
  return {
    canBatchUpdate: (targets, value, options) => canBatchUpdate(doc, targets, value, options),
    batchUpdate: (targets, value, options) => batchUpdate(doc, targets, value, options),
  };
}
