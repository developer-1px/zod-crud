import type { JsonDoc, NodeId } from "zod-crud";
import type { NormalizedData } from "@p/aria-kernel";

export function jsonDocToNormalized(
  doc: JsonDoc,
  expanded: Set<NodeId>,
): NormalizedData {
  return {
    entities: {},
    relationships: {},
    meta: { root: [doc.rootId] },
  };
}
