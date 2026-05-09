import type {
  JsonDoc,
  NodeId,
} from "zod-crud";

export function expandedContainerIds(doc: JsonDoc): Set<NodeId> {
  const ids = new Set<NodeId>();

  for (const node of Object.values(doc.nodes)) {
    if (node.children.length > 0) {
      ids.add(node.id);
    }
  }

  return ids;
}

export function validExpandedIds(doc: JsonDoc, ids: Set<NodeId>): Set<NodeId> {
  const next = new Set<NodeId>();

  for (const id of ids) {
    const node = doc.nodes[id];

    if (node !== undefined && node.children.length > 0) {
      next.add(id);
    }
  }

  return next;
}

export function expandedForSelection(doc: JsonDoc, ids: Set<NodeId>, nodeId: NodeId): Set<NodeId> {
  const next = validExpandedIds(doc, ids);
  let current = doc.nodes[nodeId];

  while (current?.parentId !== null && current?.parentId !== undefined) {
    const parent = doc.nodes[current.parentId];

    if (parent !== undefined && parent.children.length > 0) {
      next.add(parent.id);
    }

    current = parent;
  }

  return next;
}
