import type {
  JsonDoc,
  JsonNode,
  JsonValue,
  NodeId,
} from "zod-crud";

export type GridColumn = {
  id: "path" | "key" | "type" | "value";
  label: string;
};

export type GridRow = {
  id: NodeId;
  depth: number;
  keyLabel: string;
  path: string;
  type: JsonNode["type"];
  value: string;
  expandable: boolean;
  expanded: boolean;
};

export const columns: GridColumn[] = [
  { id: "path", label: "Path" },
  { id: "key", label: "Key" },
  { id: "type", label: "Type" },
  { id: "value", label: "Value" },
];

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

export function pathString(doc: JsonDoc, nodeId: NodeId): string {
  const segments: Array<string | number> = [];
  let current = doc.nodes[nodeId];

  while (current !== undefined && current.parentId !== null) {
    if (current.key !== null) {
      segments.unshift(current.key);
    }

    current = doc.nodes[current.parentId];
  }

  return `/${segments.map(String).join("/")}`;
}

export function valueLabel(value: JsonValue): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function nodeValueLabel(node: JsonNode): string {
  if (node.type === "object") {
    return `{${node.children.length}}`;
  }

  if (node.type === "array") {
    return `[${node.children.length}]`;
  }

  return node.value === undefined ? "" : valueLabel(node.value);
}
