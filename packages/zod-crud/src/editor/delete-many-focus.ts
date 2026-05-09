import type {
  FocusFilter,
  JsonDoc,
  NodeId,
} from "../types.js";

export function focusAfterSiblingBatchRemoval(
  before: JsonDoc,
  after: JsonDoc,
  parentId: NodeId,
  deletedNodeIds: NodeId[],
  focusFilter?: FocusFilter,
): NodeId {
  const parent = before.nodes[parentId];
  const deleted = new Set(deletedNodeIds);
  const deletedIndexes = parent?.children
    .map((childId, index) => deleted.has(childId) ? index : -1)
    .filter((index) => index >= 0) ?? [];

  if (deletedIndexes.length === 0) {
    return after.nodes[parentId] === undefined ? after.rootId : parentId;
  }

  const minIndex = Math.min(...deletedIndexes);
  const maxIndex = Math.max(...deletedIndexes);
  const nextId = parent?.children.slice(maxIndex + 1).find((childId) => !deleted.has(childId));
  const previousId = parent?.children.slice(0, minIndex).reverse().find((childId) => !deleted.has(childId));
  const candidates = [nextId, previousId, parentId, after.rootId];

  return candidates.find((id): id is NodeId =>
    id !== undefined &&
    after.nodes[id] !== undefined &&
    (focusFilter?.(after, id) ?? true)
  ) ?? after.rootId;
}
