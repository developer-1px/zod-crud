import type { JSONDocument } from "zod-crud";
import { fillDown } from "./operations.js";
import { canFillDown } from "./plan.js";
import type { FillDown } from "./types.js";

export function createFillDown<TDocument>(doc: JSONDocument<TDocument>): FillDown<TDocument> {
  return {
    canFillDown: (path, options) => canFillDown(doc, path, options),
    fillDown: (path, options) => fillDown(doc, path, options),
  };
}
