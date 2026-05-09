import type {
  JsonChange,
  JsonDoc,
  JsonNode,
  NodeId,
} from "../types.js";

export function cloneNode(node: JsonNode): JsonNode {
  return {
    ...node,
    children: [...node.children],
  };
}

export function collectSubtree(doc: JsonDoc, rootId: NodeId): JsonNode[] {
  const root = doc.nodes[rootId];

  if (root === undefined) {
    return [];
  }

  return [
    root,
    ...root.children.flatMap((childId) => collectSubtree(doc, childId)),
  ];
}

export function pushExistingUpdate(
  changes: JsonChange[],
  pushedUpdates: Set<NodeId>,
  before: JsonDoc,
  after: JsonDoc,
  nodeId: NodeId,
): void {
  if (pushedUpdates.has(nodeId)) {
    return;
  }

  const beforeNode = before.nodes[nodeId];
  const afterNode = after.nodes[nodeId];

  if (beforeNode === undefined || afterNode === undefined || sameNode(beforeNode, afterNode)) {
    return;
  }

  pushedUpdates.add(nodeId);
  changes.push({
    type: "update",
    nodeId,
    before: cloneNode(beforeNode),
    after: cloneNode(afterNode),
  });
}

function sameNode(left: JsonNode, right: JsonNode): boolean {
  return left.type === right.type &&
    left.parentId === right.parentId &&
    left.key === right.key &&
    left.value === right.value &&
    left.children.length === right.children.length &&
    left.children.every((childId, index) => childId === right.children[index]);
}
