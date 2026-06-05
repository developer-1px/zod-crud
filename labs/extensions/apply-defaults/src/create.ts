import type { JSONDocument } from "zod-crud";
import { ensure } from "./operations.js";
import { canEnsure } from "./plan.js";
import type { ApplyDefaults } from "./types.js";

export function createApplyDefaults<TDocument>(doc: JSONDocument<TDocument>): ApplyDefaults<TDocument> {
  return {
    canEnsure: (path, defaults) => canEnsure(doc, path, defaults),
    ensure: (path, defaults) => ensure(doc, path, defaults),
  };
}
