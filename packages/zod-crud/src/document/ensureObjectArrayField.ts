import type {
  JsonDoc,
  NodeId,
} from "../types.js";
import {
  findChildByKey,
  getNode,
} from "./json-doc-access.js";
import { insertChild } from "./json-doc-mutations.js";

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
