import type { JSONDocument } from "zod-crud";
import { padText } from "./operations.js";
import { canPadText } from "./plan.js";
import type { PadText } from "./types.js";

export function createPadText<TDocument>(doc: JSONDocument<TDocument>): PadText<TDocument> {
  return {
    canPadText: (pointer, length, options) => canPadText(doc, pointer, length, options),
    padText: (pointer, length, options) => padText(doc, pointer, length, options),
  };
}
