import type {
  JsonDoc,
  JsonNode,
  NodeId,
} from "../types.js";
import { getNode } from "../document/json-doc.js";

export function sortBySiblingIndexDescending(doc: JsonDoc, parentId: NodeId, nodes: JsonNode[]): JsonNode[] {
  const parent = getNode(doc, parentId);
  const siblingIndex = new Map(parent.children.map((childId, index) => [childId, index]));

  return [...nodes].sort((left, right) =>
    (siblingIndex.get(right.id) ?? -1) - (siblingIndex.get(left.id) ?? -1),
  );
}
