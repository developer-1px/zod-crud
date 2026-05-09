import type {
  JsonDoc,
  NodeId,
} from "zod-crud";

import type { GridRow } from "./grid-columns.js";
import {
  nodeValueLabel,
  pathString,
} from "./grid-labels.js";

export function buildGridRows(doc: JsonDoc, expandedIds: Set<NodeId>): GridRow[] {
  const rows: GridRow[] = [];

  function visit(nodeId: NodeId, depth: number) {
    const node = doc.nodes[nodeId];

    if (node === undefined) {
      return;
    }

    const expandable = node.children.length > 0;
    const expanded = expandedIds.has(node.id);

    rows.push({
      id: node.id,
      depth,
      keyLabel: node.key === null ? "root" : String(node.key),
      path: pathString(doc, node.id),
      type: node.type,
      value: nodeValueLabel(node),
      expandable,
      expanded,
    });

    if (expandable && expanded) {
      for (const childId of node.children) {
        visit(childId, depth + 1);
      }
    }
  }

  visit(doc.rootId, 0);
  return rows;
}
