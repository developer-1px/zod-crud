import type { JSONDocument } from "zod-crud";
import { fillGridRange, pasteGridRange } from "./operations.js";
import { canFillGridRange, canPasteGridRange } from "./plan.js";
import type { GridRange } from "./types.js";

export function createGridRange<TDocument>(doc: JSONDocument<TDocument>): GridRange<TDocument> {
  return {
    canPaste: (input, options) => canPasteGridRange(doc, input, options),
    paste: (input, options, metadata) => pasteGridRange(doc, input, options, metadata),
    canFill: (input, options) => canFillGridRange(doc, input, options),
    fill: (input, options, metadata) => fillGridRange(doc, input, options, metadata),
  };
}
