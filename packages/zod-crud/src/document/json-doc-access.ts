import type {
  JsonDoc,
  JsonKey,
  JsonNode,
  JsonPath,
  NodeId,
} from "../types.js";

export function getPath(doc: JsonDoc, nodeId: NodeId): JsonPath {
  const path: JsonPath = [];
  let current = getNode(doc, nodeId);

  while (current.parentId !== null) {
    if (current.key === null) {
      throw new Error(`Non-root node ${current.id} is missing a key.`);
    }

    path.push(current.key);
    current = getNode(doc, current.parentId);
  }

  return path.reverse();
}

export function findChildByKey(doc: JsonDoc, parentId: NodeId, key: JsonKey): JsonNode | null {
  const parent = getNode(doc, parentId);

  for (const childId of parent.children) {
    const child = getNode(doc, childId);

    if (child.key === key) {
      return child;
    }
  }

  return null;
}

export function getNode(doc: JsonDoc, nodeId: NodeId): JsonNode {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    throw new Error(`Node not found: ${nodeId}.`);
  }

  return node;
}

export function maxNodeIndex(doc: JsonDoc): number {
  let max = 0;

  for (const id of Object.keys(doc.nodes)) {
    const match = /^n(\d+)$/.exec(id);

    if (match === null) {
      continue;
    }

    max = Math.max(max, Number(match[1]));
  }

  return max;
}
