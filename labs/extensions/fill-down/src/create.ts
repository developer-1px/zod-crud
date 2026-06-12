import type { JSONDocument } from "@interactive-os/json-document";
import { fillDown } from "./operations.js";
import { canFillDown } from "./plan.js";
import type { FillDown } from "./types.js";

export function createFillDown<TDocument>(doc: JSONDocument<TDocument>): FillDown<TDocument> {
  return {
    canFillDown: (path, options) => canFillDown(doc, path, options),
    fillDown: (path, options) => fillDown(doc, path, options),
  };
}
