import type { JSONDocument } from "@interactive-os/json-document";
import { toggleValue } from "./operations.js";
import { canToggleValue } from "./plan.js";
import type { ToggleValue } from "./types.js";

export function createToggleValue<TDocument>(doc: JSONDocument<TDocument>): ToggleValue<TDocument> {
  return {
    canToggleValue: (pointer, options) => canToggleValue(doc, pointer, options),
    toggleValue: (pointer, options) => toggleValue(doc, pointer, options),
  };
}
