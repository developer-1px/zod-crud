import type { JSONDocument } from "zod-crud";
import { applyDocumentDiff } from "./operations.js";
import { canApplyDocumentDiff, diffDocument } from "./plan.js";
import type { DocumentDiff } from "./types.js";

export function createDocumentDiff<TDocument>(
  doc: JSONDocument<TDocument>,
): DocumentDiff<TDocument> {
  return {
    diff: (target) => diffDocument(doc, target),
    canApply: (target) => canApplyDocumentDiff(doc, target),
    apply: (target, metadata) => applyDocumentDiff(doc, target, metadata),
  };
}
