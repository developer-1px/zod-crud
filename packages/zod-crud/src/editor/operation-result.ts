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
  changes: JsonChange[],
  nodeId?: NodeId,
  focusNodeId?: NodeId,
): OperationResult {
  return {
    ok: true,
    ...(nodeId === undefined ? {} : { nodeId }),
    focusNodeId: focusNodeId ?? focusFromMutation(before, after, changes, nodeId),
    changes,
  };
}

export function changesForInsertedSubtree(
  before: JsonDoc,
  after: JsonDoc,
  insertedNodeId: NodeId,
): JsonChange[] {
  const insertedRootId = highestInsertedAncestor(before, after, insertedNodeId);
  const changes: JsonChange[] = [];
  const pushedUpdates = new Set<NodeId>();
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

  for (const node of collectSubtree(after, insertedRootId)) {
    if (before.nodes[node.id] === undefined) {
      changes.push({
        type: "insert",
        nodeId: node.id,
        after: cloneNode(node),
      });
    }
  }

  return changes;
}

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

export function invertChanges(changes: JsonChange[]): JsonChange[] {
  return changes.slice().reverse().map((change) => {
    if (change.type === "insert") {
      return {
        type: "delete",
        nodeId: change.nodeId,
        before: cloneNode(change.after),
      };
    }

    if (change.type === "delete") {
      return {
        type: "insert",
        nodeId: change.nodeId,
        after: cloneNode(change.before),
      };
    }

    return {
      type: "update",
      nodeId: change.nodeId,
      before: cloneNode(change.after),
      after: cloneNode(change.before),
    };
  });
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

function highestInsertedAncestor(before: JsonDoc, after: JsonDoc, nodeId: NodeId): NodeId {
  let insertedRootId = nodeId;
  let node = after.nodes[nodeId];

  while (node?.parentId !== null && node?.parentId !== undefined && before.nodes[node.parentId] === undefined) {
    insertedRootId = node.parentId;
    node = after.nodes[node.parentId];
  }

  return insertedRootId;
}

function collectSubtree(doc: JsonDoc, rootId: NodeId): JsonNode[] {
  const root = doc.nodes[rootId];

  if (root === undefined) {
    return [];
  }

  return [
    root,
    ...root.children.flatMap((childId) => collectSubtree(doc, childId)),
  ];
}

function pushExistingUpdate(
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
