import type { JSONDocument } from "@interactive-os/json-document";
import { round } from "./operations.js";
import { canRound } from "./plan.js";
import type { Round } from "./types.js";

export function createRound<TDocument>(doc: JSONDocument<TDocument>): Round<TDocument> {
  return {
    canRound: (pointer, options) => canRound(doc, pointer, options),
    round: (pointer, options) => round(doc, pointer, options),
  };
}
