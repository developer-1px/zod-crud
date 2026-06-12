import type { JSONDocument } from "@interactive-os/json-document";
import { pasteGrid } from "./operations.js";
import { canPasteGrid } from "./plan.js";
import type { PasteCells } from "./types.js";

export function createPasteCells<TDocument>(doc: JSONDocument<TDocument>): PasteCells<TDocument> {
  return {
    canPasteGrid: (target, matrix) => canPasteGrid(doc, target, matrix),
    pasteGrid: (target, matrix) => pasteGrid(doc, target, matrix),
  };
}
