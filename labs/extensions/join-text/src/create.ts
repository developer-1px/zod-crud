import type { JSONDocument } from "@interactive-os/json-document";
import { join } from "./operations.js";
import { canJoin } from "./plan.js";
import type { JoinText } from "./types.js";

export function createJoinText<TDocument>(doc: JSONDocument<TDocument>): JoinText<TDocument> {
  return {
    canJoin: (source, target, options) => canJoin(doc, source, target, options),
    join: (source, target, options) => join(doc, source, target, options),
  };
}
