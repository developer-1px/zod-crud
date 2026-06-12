import type { JSONDocument } from "@interactive-os/json-document";
import { dedupe } from "./operations.js";
import { canDedupe } from "./plan.js";
import type { Dedupe } from "./types.js";

export function createDedupe<TDocument>(doc: JSONDocument<TDocument>): Dedupe<TDocument> {
  return {
    canDedupe: (path, options) => canDedupe(doc, path, options),
    dedupe: (path, options) => dedupe(doc, path, options),
  };
}
