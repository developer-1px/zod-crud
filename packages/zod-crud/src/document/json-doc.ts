import type {
  JsonDoc,
  JsonKey,
  JsonNode,
  JsonPath,
  JsonValue,
  NodeId,
} from "../types.js";

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

export function getPath(doc: JsonDoc, nodeId: NodeId): JsonPath {
  const path: JsonPath = [];
  let current = getNode(doc, nodeId);

  while (current.parentId !== null) {
    if (current.key === null) {
      throw new Error(`Non-root node ${current.id} is missing a key.`);
    }

    path.push(current.key);
    current = getNode(doc, current.parentId);
  }

  return path.reverse();
}

function createSubtree(
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

function createNode(
  id: NodeId,
  value: JsonValue,
  parentId: NodeId | null,
  key: JsonKey,
): JsonNode {
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

export function insertChild(
  doc: JsonDoc,
  parentId: NodeId,
  key: string | number,
  value: JsonValue,
  allocateNodeId?: () => NodeId,
): NodeId {
  const parent = getNode(doc, parentId);

  if (parent.type === "object") {
    if (typeof key !== "string") {
      throw new Error("Object children require a string key.");
    }

    if (findChildByKey(doc, parentId, key) !== null) {
      throw new Error(`Object key already exists: ${key}.`);
    }

    const childId = createSubtree(doc, value, parentId, key, undefined, allocateNodeId);
    parent.children.push(childId);
    return childId;
  }

  if (parent.type === "array") {
    if (typeof key !== "number") {
      throw new Error("Array children require a numeric index.");
    }

    if (!Number.isInteger(key)) {
      throw new Error(`Array index must be an integer: ${key}.`);
    }

    if (key < 0 || key > parent.children.length) {
      throw new Error(`Array index out of bounds: ${key}.`);
    }

    const childId = createSubtree(doc, value, parentId, key, undefined, allocateNodeId);
    parent.children.splice(key, 0, childId);
    normalizeArrayKeys(doc, parent.id);
    return childId;
  }

  throw new Error(`Cannot insert child into ${parent.type} node.`);
}

export function replaceSubtree(
  doc: JsonDoc,
  nodeId: NodeId,
  value: JsonValue,
  allocateNodeId?: () => NodeId,
): void {
  const current = getNode(doc, nodeId);
  const parentId = current.parentId;
  const key = current.key;

  for (const descendantId of collectDescendants(doc, nodeId)) {
    delete doc.nodes[descendantId];
  }

  createSubtree(doc, value, parentId, key, nodeId, allocateNodeId);
}

export function renameObjectKey(doc: JsonDoc, nodeId: NodeId, key: string): void {
  const node = getNode(doc, nodeId);

  if (node.parentId === null) {
    throw new Error("Cannot rename the root node.");
  }

  const parent = getNode(doc, node.parentId);

  if (parent.type !== "object") {
    throw new Error("Only object child keys can be renamed.");
  }

  const existing = findChildByKey(doc, parent.id, key);

  if (existing !== null && existing.id !== nodeId) {
    throw new Error(`Object key already exists: ${key}.`);
  }

  node.key = key;
}

export function removeSubtree(doc: JsonDoc, nodeId: NodeId): void {
  const node = getNode(doc, nodeId);

  if (node.parentId === null) {
    throw new Error("Cannot remove the root node.");
  }

  const parent = getNode(doc, node.parentId);
  parent.children = parent.children.filter((childId) => childId !== nodeId);

  for (const id of [nodeId, ...collectDescendants(doc, nodeId)]) {
    delete doc.nodes[id];
  }

  if (parent.type === "array") {
    normalizeArrayKeys(doc, parent.id);
  }
}

export function ensureObjectArrayField(
  doc: JsonDoc,
  objectId: NodeId,
  key: string,
  allocateNodeId?: () => NodeId,
): NodeId {
  const objectNode = getNode(doc, objectId);

  if (objectNode.type !== "object") {
    throw new Error("Target node is not an object.");
  }

  const existing = findChildByKey(doc, objectId, key);

  if (existing !== null) {
    if (existing.type !== "array") {
      throw new Error(`Existing ${key} field is not an array.`);
    }

    return existing.id;
  }

  return insertChild(doc, objectId, key, [], allocateNodeId);
}

export function findChildByKey(doc: JsonDoc, parentId: NodeId, key: JsonKey): JsonNode | null {
  const parent = getNode(doc, parentId);

  for (const childId of parent.children) {
    const child = getNode(doc, childId);

    if (child.key === key) {
      return child;
    }
  }

  return null;
}

export function getNode(doc: JsonDoc, nodeId: NodeId): JsonNode {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    throw new Error(`Node not found: ${nodeId}.`);
  }

  return node;
}

export function maxNodeIndex(doc: JsonDoc): number {
  let max = 0;

  for (const id of Object.keys(doc.nodes)) {
    const match = /^n(\d+)$/.exec(id);

    if (match === null) {
      continue;
    }

    max = Math.max(max, Number(match[1]));
  }

  return max;
}

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

export function isJsonObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function formatPath(path: JsonPath): string {
  if (path.length === 0) {
    return "$";
  }

  return path.reduce<string>((text, segment) => {
    if (typeof segment === "number") {
      return `${text}[${segment}]`;
    }

    return `${text}.${segment}`;
  }, "$");
}

function collectDescendants(doc: JsonDoc, nodeId: NodeId): NodeId[] {
  const node = getNode(doc, nodeId);
  const descendants: NodeId[] = [];

  for (const childId of node.children) {
    descendants.push(childId, ...collectDescendants(doc, childId));
  }

  return descendants;
}

function normalizeArrayKeys(doc: JsonDoc, arrayId: NodeId): void {
  const arrayNode = getNode(doc, arrayId);

  if (arrayNode.type !== "array") {
    return;
  }

  arrayNode.children.forEach((childId, index) => {
    getNode(doc, childId).key = index;
  });
}

function nextNodeId(doc: JsonDoc): NodeId {
  let index = Object.keys(doc.nodes).length + 1;

  while (doc.nodes[`n${index}`] !== undefined) {
    index += 1;
  }

  return `n${index}`;
}
