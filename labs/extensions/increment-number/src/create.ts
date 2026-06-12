import type { JSONDocument } from "@interactive-os/json-document";
import { step } from "./operations.js";
import { canStep } from "./plan.js";
import type { IncrementNumber } from "./types.js";

export function createIncrementNumber<TDocument>(doc: JSONDocument<TDocument>): IncrementNumber<TDocument> {
  return {
    canStep: (pointer, options) => canStep(doc, pointer, options),
    step: (pointer, options) => step(doc, pointer, options),
    increment: (pointer, options) => step(doc, pointer, options),
    decrement(pointer, options) {
      return step(doc, pointer, { ...options, step: -(options?.step ?? 1) });
    },
  };
}
