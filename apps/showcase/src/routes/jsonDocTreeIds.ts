import type { JsonDoc, NodeId } from "zod-crud";

export function initialExpandedIds(doc: JsonDoc): Set<NodeId> {
  const root = doc.nodes[doc.rootId];
  return new Set([doc.rootId, ...(root?.children ?? [])]);
}

export function visibleNodeIds(doc: JsonDoc, expanded: Set<NodeId>): NodeId[] {
  const result: NodeId[] = [];

  function visit(id: NodeId) {
    result.push(id);
    if (!expanded.has(id)) return;

    for (const childId of doc.nodes[id]?.children ?? []) {
      visit(childId);
    }
  }

  visit(doc.rootId);
  return result;
}

export function expandableNodeIds(doc: JsonDoc, rootId = doc.rootId): Set<NodeId> {
  const result = new Set<NodeId>();

  function visit(id: NodeId) {
    const children = doc.nodes[id]?.children ?? [];
    if (children.length > 0) result.add(id);

    for (const childId of children) {
      visit(childId);
    }
  }

  visit(rootId);
  return result;
}
