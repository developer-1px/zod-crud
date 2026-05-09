import type {
  JsonDoc,
  JsonNode,
  JsonValue,
  NodeId,
} from "zod-crud";

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

export function nodeValueLabel(node: JsonNode): string {
  if (node.type === "object") {
    return `{${node.children.length}}`;
  }

  if (node.type === "array") {
    return `[${node.children.length}]`;
  }

  return node.value === undefined ? "" : valueLabel(node.value);
}
