import type { JsonDoc, NodeId, OperationResult } from "../types.js";

export type LockedRegion = {
  lock: (nodeId: NodeId) => void;
  unlock: (nodeId: NodeId) => void;
  isLocked: (nodeId: NodeId) => boolean;
  guard: (nodeIds: ReadonlyArray<NodeId | undefined>) => OperationResult | null;
};

export function createLockedRegion(getDoc: () => JsonDoc): LockedRegion {
  const lockedSet = new Set<NodeId>();

  function lock(nodeId: NodeId): void {
    lockedSet.add(nodeId);
  }

  function unlock(nodeId: NodeId): void {
    lockedSet.delete(nodeId);
  }

  function isLocked(nodeId: NodeId): boolean {
    if (lockedSet.size === 0) return false;
    if (lockedSet.has(nodeId)) return true;
    const doc = getDoc();
    let parentId = doc.nodes[nodeId]?.parentId ?? null;
    while (parentId !== null) {
      if (lockedSet.has(parentId)) return true;
      parentId = doc.nodes[parentId]?.parentId ?? null;
    }
    return false;
  }

  function guard(nodeIds: ReadonlyArray<NodeId | undefined>): OperationResult | null {
    for (const id of nodeIds) {
      if (id !== undefined && isLocked(id)) {
        return {
          ok: false,
          code: "locked_region",
          reason: `Node ${id} is in a locked region.`,
          nodeId: id,
        };
      }
    }
    return null;
  }

  return { lock, unlock, isLocked, guard };
}
