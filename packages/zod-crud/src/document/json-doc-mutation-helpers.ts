import type {
  JsonDoc,
  NodeId,
} from "../types.js";
import { getNode } from "./json-doc-access.js";

export function collectDescendants(doc: JsonDoc, nodeId: NodeId): NodeId[] {
  const node = getNode(doc, nodeId);
  const descendants: NodeId[] = [];

  for (const childId of node.children) {
    descendants.push(childId, ...collectDescendants(doc, childId));
  }

  return descendants;
}

export function normalizeArrayKeys(doc: JsonDoc, arrayId: NodeId): void {
  const arrayNode = getNode(doc, arrayId);

  if (arrayNode.type !== "array") {
    return;
  }

  arrayNode.children.forEach((childId, index) => {
    getNode(doc, childId).key = index;
  });
}
