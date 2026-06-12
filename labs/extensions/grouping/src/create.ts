import type { JSONDocument } from "@interactive-os/json-document";
import { groupSelection, ungroupSelection } from "./operations.js";
import { canGroupSelection, canUngroupSelection } from "./plan.js";
import type { Grouping, GroupingAdapter } from "./types.js";

export function createGrouping<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: GroupingAdapter,
): Grouping<TDocument> {
  return {
    canGroup: (source) => canGroupSelection(doc, adapter, source),
    group: (source) => groupSelection(doc, adapter, source),
    canUngroup: (source) => canUngroupSelection(doc, adapter, source),
    ungroup: (source) => ungroupSelection(doc, adapter, source),
  };
}
