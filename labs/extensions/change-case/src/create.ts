import type { JSONDocument } from "@interactive-os/json-document";
import { applyTransform } from "./operations.js";
import { canTransform } from "./plan.js";
import type { ChangeCase } from "./types.js";

export function createChangeCase<TDocument>(doc: JSONDocument<TDocument>): ChangeCase<TDocument> {
  return {
    canTransform: (pointer, transform) => canTransform(doc, pointer, transform),
    transform: (pointer, transform) => applyTransform(doc, pointer, transform),
  };
}
