import type { JSONDocument } from "zod-crud";
import { limitItems } from "./operations.js";
import { canLimitItems } from "./plan.js";
import type { LimitItems } from "./types.js";

export function createLimitItems<TDocument>(doc: JSONDocument<TDocument>): LimitItems<TDocument> {
  return {
    canLimitItems: (path, max, options) => canLimitItems(doc, path, max, options),
    limitItems: (path, max, options) => limitItems(doc, path, max, options),
  };
}
