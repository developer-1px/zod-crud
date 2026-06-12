import type { JSONDocument } from "@interactive-os/json-document";
import { renumberItems } from "./operations.js";
import { canRenumberItems } from "./plan.js";
import type { RenumberItems } from "./types.js";

export function createRenumberItems<TDocument>(doc: JSONDocument<TDocument>): RenumberItems<TDocument> {
  return {
    canRenumberItems: (path, options) => canRenumberItems(doc, path, options),
    renumberItems: (path, options) => renumberItems(doc, path, options),
  };
}
