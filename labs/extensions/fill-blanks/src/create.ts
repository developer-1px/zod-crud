import type { JSONDocument } from "zod-crud";
import { fillBlanks } from "./operations.js";
import { canFillBlanks } from "./plan.js";
import type { FillBlanks } from "./types.js";

export function createFillBlanks<TDocument>(doc: JSONDocument<TDocument>): FillBlanks<TDocument> {
  return {
    canFillBlanks: (targets, value, options) => canFillBlanks(doc, targets, value, options),
    fillBlanks: (targets, value, options) => fillBlanks(doc, targets, value, options),
  };
}
