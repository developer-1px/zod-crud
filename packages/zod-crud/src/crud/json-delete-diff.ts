import type {
  JsonChange,
  JsonDoc,
  JsonNode,
  NodeId,
} from "../types.js";
import {
  cloneNode,
  collectSubtree,
  pushExistingUpdate,
} from "./json-change-nodes.js";

export function changesForDeletedSubtree(
  before: JsonDoc,
  after: JsonDoc,
  deletedNodeId: NodeId,
): JsonChange[] {
  return changesForDeletedSubtrees(before, after, [deletedNodeId]);
}

export function changesForDeletedSubtrees(
  before: JsonDoc,
  after: JsonDoc,
  deletedNodeIds: NodeId[],
): JsonChange[] {
  const changes: JsonChange[] = [];
  const pushedUpdates = new Set<NodeId>();
  const deletedRoots = [...new Set(deletedNodeIds)]
    .map((nodeId) => before.nodes[nodeId])
    .filter((node): node is JsonNode => node !== undefined);
  const parentIds = new Set(
    deletedRoots
      .map((node) => node.parentId)
      .filter((parentId): parentId is NodeId => parentId !== null),
  );

  for (const parentId of parentIds) {
    pushExistingUpdate(changes, pushedUpdates, before, after, parentId);

    const parent = after.nodes[parentId];

    if (parent?.type === "array") {
      for (const childId of parent.children) {
        pushExistingUpdate(changes, pushedUpdates, before, after, childId);
      }
    }
  }

  const pushedDeletes = new Set<NodeId>();

  for (const deletedRoot of deletedRoots) {
    for (const node of collectSubtree(before, deletedRoot.id)) {
      if (pushedDeletes.has(node.id)) {
        continue;
      }

      pushedDeletes.add(node.id);
      changes.push({
        type: "delete",
        nodeId: node.id,
        before: cloneNode(node),
      });
    }
  }

  return changes;
}
