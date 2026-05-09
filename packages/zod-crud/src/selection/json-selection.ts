import type {
  JsonDoc,
  JsonNode,
  NodeId,
  OperationResult,
} from "../types.js";
import { getNode } from "../document/json-doc.js";

export type SelectionPlan = {
  ok: true;
  nodeIds: NodeId[];
  nodes: JsonNode[];
  removedNodeIds: NodeId[];
};

type OperationFailure = Extract<OperationResult, { ok: false }>;

export function normalizeSelection(doc: JsonDoc, nodeIds: NodeId[]): SelectionPlan | OperationFailure {
  const unique = uniqueNodes(doc, nodeIds);

  if (unique.length === 0) {
    return { ok: false, code: "empty_selection", reason: "No nodes selected." };
  }

  const uniqueIds = new Set(unique.map((node) => node.id));
  const normalized = unique.filter((node) => !hasSelectedAncestor(doc, node, uniqueIds));
  const removedNodeIds = unique
    .filter((node) => !normalized.some((candidate) => candidate.id === node.id))
    .map((node) => node.id);
  const nodes = sortByDocumentOrder(doc, normalized);

  return {
    ok: true,
    nodeIds: nodes.map((node) => node.id),
    nodes,
    removedNodeIds,
  };
}

export function uniqueNodes(doc: JsonDoc, nodeIds: NodeId[]): JsonNode[] {
  const seen = new Set<NodeId>();
  const nodes: JsonNode[] = [];

  for (const nodeId of nodeIds) {
    if (seen.has(nodeId)) {
      continue;
    }

    seen.add(nodeId);
    nodes.push(getNode(doc, nodeId));
  }

  return nodes;
}

export function sortByDocumentOrder(doc: JsonDoc, nodes: JsonNode[]): JsonNode[] {
  const order = new Map<NodeId, number>();
  let index = 0;

  visit(doc.rootId);

  return [...nodes].sort((left, right) => (order.get(left.id) ?? Infinity) - (order.get(right.id) ?? Infinity));

  function visit(nodeId: NodeId): void {
    if (order.has(nodeId)) {
      return;
    }

    order.set(nodeId, index);
    index += 1;

    for (const childId of doc.nodes[nodeId]?.children ?? []) {
      visit(childId);
    }
  }
}

function hasSelectedAncestor(doc: JsonDoc, node: JsonNode, selectedIds: Set<NodeId>): boolean {
  let parentId = node.parentId;

  while (parentId !== null) {
    if (selectedIds.has(parentId)) {
      return true;
    }

    parentId = doc.nodes[parentId]?.parentId ?? null;
  }

  return false;
}
