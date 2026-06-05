import type { JSONDocument } from "zod-crud";
import { swapItems } from "./operations.js";
import { canSwapItems } from "./plan.js";
import type { SwapItems } from "./types.js";

export function createSwapItems<TDocument>(doc: JSONDocument<TDocument>): SwapItems<TDocument> {
  return {
    canSwapItems: (a, b) => canSwapItems(doc, a, b),
    swapItems: (a, b) => swapItems(doc, a, b),
  };
}
