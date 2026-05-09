import type {
  JsonDoc,
  JsonNode,
  JsonValue,
  NodeId,
} from "zod-crud";

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
