import type {
  JsonDoc,
  JsonKey,
  JsonNode,
  JsonValue,
  NodeId,
} from "../types.js";
import { getNode } from "./json-doc-access.js";
import { hasOwn, isJsonObject } from "./json-doc-values.js";

export function serialize(value: JsonValue): JsonDoc {
  const doc: JsonDoc = { rootId: "n1", nodes: {} };
  doc.rootId = createSubtree(doc, value, null, null, "n1");
  return doc;
}

export function deserialize(doc: JsonDoc, nodeId: NodeId = doc.rootId): JsonValue {
  const node = getNode(doc, nodeId);

  if (node.type === "object") {
    const object: Record<string, JsonValue> = {};

    for (const childId of node.children) {
      const child = getNode(doc, childId);

      if (typeof child.key !== "string") {
        throw new Error(`Object child ${child.id} has non-string key.`);
      }

      if (hasOwn(object, child.key)) {
        throw new Error(`Object node ${node.id} has duplicate key: ${child.key}.`);
      }

      Object.defineProperty(object, child.key, {
        configurable: true,
        enumerable: true,
        value: deserialize(doc, child.id),
        writable: true,
      });
    }

    return object;
  }

  if (node.type === "array") {
    return node.children.map((childId) => deserialize(doc, childId));
  }

  return node.value ?? null;
}

export function createSubtree(
  doc: JsonDoc,
  value: JsonValue,
  parentId: NodeId | null,
  key: JsonKey,
  forcedId?: NodeId,
  allocateNodeId?: () => NodeId,
): NodeId {
  const id = forcedId ?? allocateNodeId?.() ?? nextNodeId(doc);
  const node = createNode(id, value, parentId, key);
  doc.nodes[id] = node;

  if (Array.isArray(value)) {
    value.forEach((childValue, index) => {
      node.children.push(createSubtree(doc, childValue, id, index, undefined, allocateNodeId));
    });
    return id;
  }

  if (isJsonObject(value)) {
    for (const [childKey, childValue] of Object.entries(value)) {
      node.children.push(createSubtree(doc, childValue, id, childKey, undefined, allocateNodeId));
    }
  }

  return id;
}

function createNode(id: NodeId, value: JsonValue, parentId: NodeId | null, key: JsonKey): JsonNode {
  if (Array.isArray(value)) {
    return { id, type: "array", parentId, key, children: [] };
  }

  if (isJsonObject(value)) {
    return { id, type: "object", parentId, key, children: [] };
  }

  if (value === null) {
    return { id, type: "null", parentId, key, children: [], value: null };
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("JSON numbers must be finite.");
  }

  if (typeof value === "string") {
    return { id, type: "string", parentId, key, children: [], value };
  }

  if (typeof value === "number") {
    return { id, type: "number", parentId, key, children: [], value };
  }

  if (typeof value === "boolean") {
    return { id, type: "boolean", parentId, key, children: [], value };
  }

  throw new Error(`Unsupported JSON value: ${String(value)}.`);
}

function nextNodeId(doc: JsonDoc): NodeId {
  let index = Object.keys(doc.nodes).length + 1;

  while (doc.nodes[`n${index}`] !== undefined) {
    index += 1;
  }

  return `n${index}`;
}
