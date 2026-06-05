import type { JSONDocument } from "zod-crud";
import { trimText } from "./operations.js";
import { canTrimText } from "./plan.js";
import type { TrimText } from "./types.js";

export function createTrimText<TDocument>(doc: JSONDocument<TDocument>): TrimText<TDocument> {
  return {
    canTrimText: (pointer, maxLength, options) => canTrimText(doc, pointer, maxLength, options),
    trimText: (pointer, maxLength, options) => trimText(doc, pointer, maxLength, options),
  };
}
