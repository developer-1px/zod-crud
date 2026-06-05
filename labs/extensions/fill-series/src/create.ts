import type { JSONDocument } from "zod-crud";
import { fill } from "./operations.js";
import { canFill } from "./plan.js";
import type { FillSeries } from "./types.js";

export function createFillSeries<TDocument>(
  doc: JSONDocument<TDocument>,
): FillSeries<TDocument> {
  return {
    canFill: (target, source, options) => canFill(doc, target, source, options),
    fill: (target, source, options) => fill(doc, target, source, options),
  };
}
