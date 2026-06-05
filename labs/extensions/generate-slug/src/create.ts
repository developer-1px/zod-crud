import type { JSONDocument } from "zod-crud";
import { generateSlug } from "./operations.js";
import { canGenerateSlug } from "./plan.js";
import type { GenerateSlug } from "./types.js";

export function createGenerateSlug<TDocument>(doc: JSONDocument<TDocument>): GenerateSlug<TDocument> {
  return {
    canGenerateSlug: (source, target, options) => canGenerateSlug(doc, source, target, options),
    generateSlug: (source, target, options) => generateSlug(doc, source, target, options),
  };
}
