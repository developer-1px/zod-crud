import type { JSONDocument } from "@interactive-os/json-document";
import { split } from "./operations.js";
import { canSplit } from "./plan.js";
import type { SplitText } from "./types.js";

export function createSplitText<TDocument>(doc: JSONDocument<TDocument>): SplitText<TDocument> {
  return {
    canSplit: (path, text, options) => canSplit(doc, path, text, options),
    split: (path, text, options) => split(doc, path, text, options),
  };
}
