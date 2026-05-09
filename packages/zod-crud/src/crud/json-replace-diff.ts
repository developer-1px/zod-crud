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

export function changesForReplacedSubtree(
  before: JsonDoc,
  after: JsonDoc,
  replacedNodeId: NodeId,
): JsonChange[] {
  const changes: JsonChange[] = [];
  const pushedUpdates = new Set<NodeId>();

  pushExistingUpdate(changes, pushedUpdates, before, after, replacedNodeId);

  for (const beforeNode of collectSubtree(before, replacedNodeId)) {
    if (beforeNode.id !== replacedNodeId && after.nodes[beforeNode.id] === undefined) {
      changes.push({
        type: "delete",
        nodeId: beforeNode.id,
        before: cloneNode(beforeNode),
      });
    }
  }

  for (const afterNode of collectSubtree(after, replacedNodeId)) {
    if (before.nodes[afterNode.id] === undefined) {
      changes.push({
        type: "insert",
        nodeId: afterNode.id,
        after: cloneNode(afterNode),
      });
    }
  }

  return changes;
}
