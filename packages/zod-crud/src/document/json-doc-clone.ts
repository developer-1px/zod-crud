import type {
  JsonDoc,
  JsonNode,
  JsonValue,
  NodeId,
} from "../types.js";

export function cloneDoc(doc: JsonDoc): JsonDoc {
  const nodes: Record<NodeId, JsonNode> = {};

  for (const [id, node] of Object.entries(doc.nodes)) {
    nodes[id] = { ...node, children: [...node.children] };
  }

  return { rootId: doc.rootId, nodes };
}

export function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
