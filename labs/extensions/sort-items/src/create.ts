import type { JSONDocument } from "zod-crud";
import { reverse, sort } from "./operations.js";
import { canReverse, canSort } from "./plan.js";
import type { SortItems } from "./types.js";

export function createSortItems<TDocument>(
  doc: JSONDocument<TDocument>,
): SortItems<TDocument> {
  return {
    canSort: (path, compare) => canSort(doc, path, compare),
    sort: (path, compare) => sort(doc, path, compare),
    canReverse: (path) => canReverse(doc, path),
    reverse: (path) => reverse(doc, path),
  };
}
