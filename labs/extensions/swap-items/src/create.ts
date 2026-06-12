import type { JSONDocument } from "@interactive-os/json-document";
import { swapItems } from "./operations.js";
import { canSwapItems } from "./plan.js";
import type { SwapItems } from "./types.js";

export function createSwapItems<TDocument>(doc: JSONDocument<TDocument>): SwapItems<TDocument> {
  return {
    canSwapItems: (a, b) => canSwapItems(doc, a, b),
    swapItems: (a, b) => swapItems(doc, a, b),
  };
}
