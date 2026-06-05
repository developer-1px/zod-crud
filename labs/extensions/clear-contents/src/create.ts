import type { JSONDocument } from "zod-crud";
import { clearContents } from "./operations.js";
import { canClearContents } from "./plan.js";
import type { ClearContents } from "./types.js";

export function createClearContents<TDocument>(doc: JSONDocument<TDocument>): ClearContents<TDocument> {
  return {
    canClearContents: (targets, options) => canClearContents(doc, targets, options),
    clearContents: (targets, options) => clearContents(doc, targets, options),
  };
}
