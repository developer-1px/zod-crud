import type { JSONDocument } from "zod-crud";
import { performDrop } from "./operations.js";
import { canDrop } from "./plan.js";
import type { DragDrop } from "./types.js";

export function createDragDrop<TDocument>(
  doc: JSONDocument<TDocument>,
): DragDrop<TDocument> {
  return {
    canDrop: (input) => canDrop(doc, input),
    perform: (input) => performDrop(doc, input),
  };
}
