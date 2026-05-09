import type { JsonDoc, JsonValue, NodeId } from "../types.js";
import { findChildByKey, getNode } from "./json-doc-access.js";
import {
  collectDescendants,
  normalizeArrayKeys,
} from "./json-doc-mutation-helpers.js";
import { createSubtree } from "./json-doc-serialization.js";

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
