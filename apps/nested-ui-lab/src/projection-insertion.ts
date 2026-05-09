import type {
  JsonDoc,
  JsonNode,
  NodeId,
} from "zod-crud";

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

function childByKey(doc: JsonDoc, nodeId: NodeId, key: string | number): JsonNode | undefined {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return undefined;
  }

  const childId = node.children.find((id) => doc.nodes[id]?.key === key);
  return childId === undefined ? undefined : doc.nodes[childId];
}
