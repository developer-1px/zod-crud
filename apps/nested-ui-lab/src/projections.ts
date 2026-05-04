import type {
  JsonDoc,
  JsonNode,
  JsonValue,
  NodeId,
} from "zod-crud";

export type ProjectionColumn = {
  id: "path" | "key" | "type" | "value";
  label: string;
};

export type ProjectionRow = {
  id: NodeId;
  depth: number;
  keyLabel: string;
  path: string;
  type: JsonNode["type"];
  value: string;
  expandable: boolean;
  expanded: boolean;
};

export const projectionColumns: ProjectionColumn[] = [
  { id: "path", label: "Path" },
  { id: "key", label: "Key" },
  { id: "type", label: "Type" },
  { id: "value", label: "Value" },
];

export function buildRows(doc: JsonDoc, expandedIds: Set<NodeId>): ProjectionRow[] {
  const rows: ProjectionRow[] = [];

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

export function expandedForSelection(doc: JsonDoc, expandedIds: Set<NodeId>, nodeId: NodeId): Set<NodeId> {
  const next = validExpandedIds(doc, expandedIds);
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

export function validExpandedIds(doc: JsonDoc, expandedIds: Set<NodeId>): Set<NodeId> {
  const next = new Set<NodeId>();

  for (const id of expandedIds) {
    const node = doc.nodes[id];

    if (node !== undefined && node.children.length > 0) {
      next.add(id);
    }
  }

  return next;
}

export function insertionArrayId(doc: JsonDoc, nodeId: NodeId, childKeys: string[]): NodeId | null {
  let current = doc.nodes[nodeId];

  while (current !== undefined) {
    if (current.type === "array") {
      return current.id;
    }

    if (current.type === "object") {
      for (const childKey of childKeys) {
        const child = childByKey(doc, current.id, childKey);

        if (child?.type === "array") {
          return child.id;
        }
      }
    }

    current = current.parentId === null ? undefined : doc.nodes[current.parentId];
  }

  return null;
}

export function canRenameNode(doc: JsonDoc, nodeId: NodeId): boolean {
  const node = doc.nodes[nodeId];
  const parent = node?.parentId === null || node?.parentId === undefined
    ? undefined
    : doc.nodes[node.parentId];

  return parent?.type === "object";
}

export function canUpdateNode(node: JsonNode | undefined): boolean {
  return node !== undefined && !["object", "array"].includes(node.type);
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

export function parseNodeValue(node: JsonNode, input: string): JsonValue {
  if (node.type === "string") {
    return input;
  }

  if (node.type === "number") {
    const value = Number(input);

    if (!Number.isFinite(value)) {
      throw new Error("Number value must be finite.");
    }

    return value;
  }

  if (node.type === "boolean") {
    if (input === "true") {
      return true;
    }

    if (input === "false") {
      return false;
    }

    throw new Error("Boolean value must be true or false.");
  }

  if (node.type === "null") {
    if (input === "null" || input === "") {
      return null;
    }

    throw new Error("Null value must stay null.");
  }

  return JSON.parse(input) as JsonValue;
}

export function valueInput(node: JsonNode | undefined): string {
  if (node === undefined || node.value === undefined) {
    return "";
  }

  return String(node.value);
}

export function nodeValueLabel(node: JsonNode): string {
  if (node.type === "object") {
    return `{${node.children.length}}`;
  }

  if (node.type === "array") {
    return `[${node.children.length}]`;
  }

  return node.value === undefined ? "" : valueLabel(node.value);
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

function childByKey(doc: JsonDoc, nodeId: NodeId, key: string | number): JsonNode | undefined {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return undefined;
  }

  const childId = node.children.find((id) => doc.nodes[id]?.key === key);
  return childId === undefined ? undefined : doc.nodes[childId];
}
