import type { JSONDocument } from "zod-crud";
import { moveSelected } from "./operations.js";
import { canMoveSelected } from "./plan.js";
import type { MoveSelected } from "./types.js";

export function createMoveSelected<TDocument>(
  doc: JSONDocument<TDocument>,
): MoveSelected<TDocument> {
  return {
    canMoveSelected: (source, target) => canMoveSelected(doc, source, target),
    moveSelected: (source, target) => moveSelected(doc, source, target),
  };
}
