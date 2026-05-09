import type {
  JsonChange,
  JsonDoc,
  NodeId,
} from "../types.js";
import {
  cloneNode,
  collectSubtree,
  pushExistingUpdate,
} from "./json-change-nodes.js";

export function changesForInsertedSubtree(
  before: JsonDoc,
  after: JsonDoc,
  insertedNodeId: NodeId,
): JsonChange[] {
  return changesForInsertedSubtrees(before, after, [insertedNodeId]);
}

export function changesForInsertedSubtrees(
  before: JsonDoc,
  after: JsonDoc,
  insertedNodeIds: NodeId[],
): JsonChange[] {
  const insertedRootIds = [...new Set(
    insertedNodeIds.map((nodeId) => highestInsertedAncestor(before, after, nodeId)),
  )];
  const changes: JsonChange[] = [];
  const pushedUpdates = new Set<NodeId>();

  for (const insertedRootId of insertedRootIds) {
    const insertedRoot = after.nodes[insertedRootId];

    if (insertedRoot?.parentId !== null && insertedRoot?.parentId !== undefined) {
      pushExistingUpdate(changes, pushedUpdates, before, after, insertedRoot.parentId);

      const parent = after.nodes[insertedRoot.parentId];

      if (parent?.type === "array") {
        for (const childId of parent.children) {
          pushExistingUpdate(changes, pushedUpdates, before, after, childId);
        }
      }
    }
  }

  const pushedInserts = new Set<NodeId>();

  for (const insertedRootId of insertedRootIds) {
    for (const node of collectSubtree(after, insertedRootId)) {
      if (before.nodes[node.id] !== undefined || pushedInserts.has(node.id)) {
        continue;
      }

      pushedInserts.add(node.id);
      changes.push({
        type: "insert",
        nodeId: node.id,
        after: cloneNode(node),
      });
    }
  }

  return changes;
}

function highestInsertedAncestor(before: JsonDoc, after: JsonDoc, nodeId: NodeId): NodeId {
  let insertedRootId = nodeId;
  let node = after.nodes[nodeId];

  while (node?.parentId !== null && node?.parentId !== undefined && before.nodes[node.parentId] === undefined) {
    insertedRootId = node.parentId;
    node = after.nodes[node.parentId];
  }

  return insertedRootId;
}
