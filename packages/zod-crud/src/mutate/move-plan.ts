import type {
  JsonChange,
  JsonDoc,
  JsonNode,
  NodeId,
  OperationResult,
} from "../types.js";
import { cloneNode, pushExistingUpdate } from "../history/change/change-nodes.js";

type OperationFailure = Extract<OperationResult, { ok: false }>;

export type MovePlan = {
  ok: true;
  next: JsonDoc;
  changes: JsonChange[];
  nodeId: NodeId;
  focusNodeId: NodeId;
  focusNodeIds?: NodeId[];
};

export function insertionIndex(
  targetArray: JsonNode,
  siblingId: NodeId | undefined,
  placement: "before" | "after" | "into",
  requestedIndex: number | undefined,
): { ok: true; index: number } | OperationFailure {
  if (placement === "into") {
    const index = requestedIndex ?? targetArray.children.length;
    if (!Number.isInteger(index) || index < 0 || index > targetArray.children.length) {
      return { ok: false, code: "invalid_target", reason: `Move index out of bounds: ${String(index)}.` };
    }

    return { ok: true, index };
  }

  const siblingIndex = siblingId === undefined ? -1 : targetArray.children.indexOf(siblingId);

  if (siblingIndex < 0) {
    return {
      ok: false,
      code: "invalid_target",
      reason: "Move sibling is not present in its parent.",
      ...(siblingId === undefined ? {} : { nodeId: siblingId }),
    };
  }

  return { ok: true, index: placement === "before" ? siblingIndex : siblingIndex + 1 };
}

export function changesForMove(before: JsonDoc, after: JsonDoc): JsonChange[] {
  const changes: JsonChange[] = [];
  const pushedUpdates = new Set<NodeId>();
  const allNodeIds = new Set([...Object.keys(before.nodes), ...Object.keys(after.nodes)]);

  for (const nodeId of allNodeIds) {
    pushExistingUpdate(changes, pushedUpdates, before, after, nodeId);
  }

  for (const nodeId of allNodeIds) {
    if (before.nodes[nodeId] === undefined && after.nodes[nodeId] !== undefined) {
      changes.push({ type: "insert", nodeId, after: cloneNode(after.nodes[nodeId]!) });
    } else if (before.nodes[nodeId] !== undefined && after.nodes[nodeId] === undefined) {
      changes.push({ type: "delete", nodeId, before: cloneNode(before.nodes[nodeId]!) });
    }
  }

  return changes;
}

export function isDescendant(doc: JsonDoc, candidateId: NodeId, ancestorId: NodeId): boolean {
  let parentId = doc.nodes[candidateId]?.parentId ?? null;

  while (parentId !== null) {
    if (parentId === ancestorId) {
      return true;
    }

    parentId = doc.nodes[parentId]?.parentId ?? null;
  }

  return false;
}
