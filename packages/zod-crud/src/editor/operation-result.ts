import type {
  JsonChange,
  JsonDoc,
  JsonNode,
  NodeId,
  OperationResult,
} from "../types.js";

export function successResult(
  before: JsonDoc,
  after: JsonDoc,
  nodeId?: NodeId,
): OperationResult {
  const changes = changesFromDiff(before, after);

  return {
    ok: true,
    ...(nodeId === undefined ? {} : { nodeId }),
    focusNodeId: focusFromMutation(before, after, changes, nodeId),
    changes,
  };
}

function changesFromDiff(before: JsonDoc, after: JsonDoc): JsonChange[] {
  const changes: JsonChange[] = [];

  for (const beforeNode of Object.values(before.nodes)) {
    const afterNode = after.nodes[beforeNode.id];

    if (afterNode === undefined) {
      changes.push({
        type: "delete",
        nodeId: beforeNode.id,
        before: cloneNode(beforeNode),
      });
    } else if (!sameNode(beforeNode, afterNode)) {
      changes.push({
        type: "update",
        nodeId: afterNode.id,
        before: cloneNode(beforeNode),
        after: cloneNode(afterNode),
      });
    }
  }

  for (const afterNode of Object.values(after.nodes)) {
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

function cloneNode(node: JsonNode): JsonNode {
  return {
    ...node,
    children: [...node.children],
  };
}

function focusFromMutation(
  before: JsonDoc,
  after: JsonDoc,
  changes: JsonChange[],
  primaryNodeId?: NodeId,
): NodeId {
  if (primaryNodeId !== undefined && after.nodes[primaryNodeId] !== undefined) {
    return primaryNodeId;
  }

  if (primaryNodeId !== undefined && before.nodes[primaryNodeId] !== undefined) {
    return focusAfterPrimaryRemoval(before, after, primaryNodeId);
  }

  const insertedRoot = changes.find((change) =>
    change.type === "insert" &&
    change.after.parentId !== null &&
    before.nodes[change.after.parentId] !== undefined
  );

  if (insertedRoot !== undefined) {
    return insertedRoot.nodeId;
  }

  const changedExisting = changes.find((change) =>
    change.type === "update" && after.nodes[change.nodeId] !== undefined
  );

  if (changedExisting !== undefined) {
    return changedExisting.nodeId;
  }

  return after.rootId;
}

function focusAfterPrimaryRemoval(before: JsonDoc, after: JsonDoc, removedId: NodeId): NodeId {
  const removed = before.nodes[removedId];
  const siblings = removed?.parentId === null || removed?.parentId === undefined
    ? []
    : before.nodes[removed.parentId]?.children ?? [];
  const index = siblings.indexOf(removedId);
  const candidates = [
    siblings[index + 1],
    siblings[index - 1],
    removed?.parentId,
    after.rootId,
  ];

  return candidates.find((id): id is NodeId =>
    id !== undefined && id !== null && after.nodes[id] !== undefined
  ) ?? after.rootId;
}

function sameNode(left: JsonNode, right: JsonNode): boolean {
  return left.type === right.type &&
    left.parentId === right.parentId &&
    left.key === right.key &&
    left.value === right.value &&
    left.children.length === right.children.length &&
    left.children.every((childId, index) => childId === right.children[index]);
}
