import type { FocusFilter, JsonChange, JsonDoc, NodeId } from "../types.js";

export function focusFromMutation(
  before: JsonDoc,
  after: JsonDoc,
  changes: JsonChange[],
  primaryNodeId?: NodeId,
  focusFilter?: FocusFilter,
): NodeId {
  if (isFocusCandidate(after, primaryNodeId, focusFilter)) {
    return primaryNodeId;
  }

  if (primaryNodeId !== undefined && before.nodes[primaryNodeId] !== undefined) {
    return focusAfterPrimaryRemoval(before, after, primaryNodeId, focusFilter);
  }

  const insertedRoot = changes.find((change) =>
    change.type === "insert" &&
    change.after.parentId !== null &&
    before.nodes[change.after.parentId] !== undefined
  );

  if (isFocusCandidate(after, insertedRoot?.nodeId, focusFilter)) {
    return insertedRoot.nodeId;
  }

  const changedExisting = changes.find((change) =>
    change.type === "update" && after.nodes[change.nodeId] !== undefined
  );

  if (isFocusCandidate(after, changedExisting?.nodeId, focusFilter)) {
    return changedExisting.nodeId;
  }

  if (isFocusCandidate(after, after.rootId, focusFilter)) {
    return after.rootId;
  }

  return after.rootId;
}

function focusAfterPrimaryRemoval(
  before: JsonDoc,
  after: JsonDoc,
  removedId: NodeId,
  focusFilter?: FocusFilter,
): NodeId {
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

  return candidates.find((id): id is NodeId => isFocusCandidate(after, id, focusFilter)) ?? after.rootId;
}

function isFocusCandidate(doc: JsonDoc, nodeId: NodeId | null | undefined, focusFilter?: FocusFilter): nodeId is NodeId {
  return nodeId !== undefined &&
    nodeId !== null &&
    doc.nodes[nodeId] !== undefined &&
    (focusFilter?.(doc, nodeId) ?? true);
}
