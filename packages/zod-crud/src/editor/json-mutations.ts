import * as z from "zod";

import type {
  JsonChange,
  JsonDoc,
  JsonNode,
  JsonPath,
  JsonValue,
  NodeId,
  OperationResult,
} from "../types.js";
import {
  cloneDoc,
  cloneJson,
  deserialize,
  ensureObjectArrayField,
  getNode,
  getPath,
  insertChild,
  removeSubtree,
  renameObjectKey,
  replaceSubtree,
} from "../document/json-doc.js";
import { validateAtPath } from "../schema/json-validation.js";
import { objectArrayFieldKeys, schemaAtPath } from "../schema/schema-path.js";
import {
  changesForDeletedSubtree,
  changesForInsertedSubtree,
  changesForReplacedSubtree,
} from "./operation-result.js";
import { failure } from "./failure.js";

type OperationFailure = Extract<OperationResult, { ok: false }>;

export type MutationsDeps<T extends JsonValue> = {
  schema: z.ZodType<T, any>;
  childKeys: string[];
  getDoc: () => JsonDoc;
  commitIfValid: (
    next: JsonDoc,
    changes: JsonChange[],
    nodeId?: NodeId,
    focusNodeId?: NodeId,
    focusNodeIds?: NodeId[],
  ) => OperationResult;
  allocateNodeId: () => NodeId;
  defaultFor?: (path: JsonPath) => JsonValue;
};

export type MutationsApi = {
  create: (parentId: NodeId, key: string | number, value?: JsonValue) => OperationResult;
  insertAfter: (siblingId: NodeId, value?: JsonValue) => OperationResult;
  insertBefore: (siblingId: NodeId, value?: JsonValue) => OperationResult;
  appendChild: (parentId: NodeId, value?: JsonValue) => OperationResult;
  update: (nodeId: NodeId, value: JsonValue) => OperationResult;
  rename: (nodeId: NodeId, key: string) => OperationResult;
  delete: (nodeId: NodeId) => OperationResult;
};

export function createMutations<T extends JsonValue>(deps: MutationsDeps<T>): MutationsApi {
  const { schema, childKeys, getDoc, commitIfValid, allocateNodeId, defaultFor } = deps;

  function create(parentId: NodeId, key: string | number, value?: JsonValue): OperationResult {
    try {
      const doc = getDoc();
      const next = cloneDoc(doc);
      const parentPath = getPath(next, parentId);
      const childValue = resolveCreateValue(parentPath, key, value);

      if (!childValue.ok) {
        return childValue;
      }

      const nodeId = insertChild(next, parentId, key, childValue.value, allocateNodeId);
      const validation = validateAtPath(schema, parentPath, deserialize(next, parentId));

      if (!validation.ok) {
        return validation;
      }

      return commitIfValid(next, changesForInsertedSubtree(doc, next, nodeId), nodeId);
    } catch (error) {
      return failure(error);
    }
  }

  function insertAfter(siblingId: NodeId, value?: JsonValue): OperationResult {
    return insertAtSibling(siblingId, value, 1, "insertAfter");
  }

  function insertBefore(siblingId: NodeId, value?: JsonValue): OperationResult {
    return insertAtSibling(siblingId, value, 0, "insertBefore");
  }

  function insertAtSibling(
    siblingId: NodeId,
    value: JsonValue | undefined,
    offset: 0 | 1,
    method: "insertAfter" | "insertBefore",
  ): OperationResult {
    try {
      const doc = getDoc();
      const sibling = getNode(doc, siblingId);

      if (sibling.parentId === null) {
        return { ok: false, reason: "Cannot insert next to the root node." };
      }

      const parent = getNode(doc, sibling.parentId);

      if (parent.type !== "array") {
        return { ok: false, reason: `${method} requires a sibling whose parent is an array.` };
      }

      const index = parent.children.indexOf(siblingId);

      if (index < 0) {
        return { ok: false, reason: "Sibling is not present in its parent." };
      }

      return create(parent.id, index + offset, value);
    } catch (error) {
      return failure(error);
    }
  }

  function appendChild(parentId: NodeId, value?: JsonValue): OperationResult {
    try {
      const doc = getDoc();
      const parent = getNode(doc, parentId);
      const next = cloneDoc(doc);
      const childArrayId = parent.type === "array"
        ? parent.id
        : childArrayIdForObjectAppend(next, parent.id);
      const childArray = getNode(next, childArrayId);
      const childArrayPath = getPath(next, childArrayId);
      const childValue = resolveCreateValue(childArrayPath, childArray.children.length, value);

      if (!childValue.ok) {
        return childValue;
      }

      const nodeId = insertChild(next, childArrayId, childArray.children.length, childValue.value, allocateNodeId);
      const validationPath = parent.type === "array" ? childArrayPath : getPath(next, parent.id);
      const validationId = parent.type === "array" ? childArrayId : parent.id;
      const validation = validateAtPath(schema, validationPath, deserialize(next, validationId));

      if (!validation.ok) {
        return validation;
      }

      return commitIfValid(next, changesForInsertedSubtree(doc, next, nodeId), nodeId);
    } catch (error) {
      return failure(error);
    }
  }

  function update(nodeId: NodeId, value: JsonValue): OperationResult {
    try {
      const doc = getDoc();
      const path = getPath(doc, nodeId);
      const validation = validateAtPath(schema, path, value);

      if (!validation.ok) {
        return validation;
      }

      const next = cloneDoc(doc);

      replaceSubtree(next, nodeId, value, allocateNodeId);
      return commitIfValid(next, changesForReplacedSubtree(doc, next, nodeId), nodeId);
    } catch (error) {
      return failure(error);
    }
  }

  function rename(nodeId: NodeId, key: string): OperationResult {
    try {
      const doc = getDoc();
      const node = getNode(doc, nodeId);

      if (node.parentId === null) {
        return { ok: false, reason: "Cannot rename the root node." };
      }

      const parent = getNode(doc, node.parentId);

      if (parent.type !== "object") {
        return { ok: false, reason: "Only object child keys can be renamed." };
      }

      const parentPath = getPath(doc, parent.id);
      const next = cloneDoc(doc);

      renameObjectKey(next, nodeId, key);
      const validation = validateAtPath(schema, parentPath, deserialize(next, parent.id));

      if (!validation.ok) {
        return validation;
      }

      return commitIfValid(next, changesForReplacedSubtree(doc, next, nodeId), nodeId);
    } catch (error) {
      return failure(error);
    }
  }

  function deleteNode(nodeId: NodeId): OperationResult {
    const doc = getDoc();

    if (nodeId === doc.rootId) {
      return { ok: false, reason: "Cannot delete the root node." };
    }

    try {
      const node = getNode(doc, nodeId);
      const parentId = node.parentId;

      if (parentId === null) {
        return { ok: false, reason: "Cannot delete a node without a parent." };
      }

      const parentPath = getPath(doc, parentId);
      const next = cloneDoc(doc);

      removeSubtree(next, nodeId);
      const validation = validateAtPath(schema, parentPath, deserialize(next, parentId));

      if (!validation.ok) {
        return validation;
      }

      return commitIfValid(next, changesForDeletedSubtree(doc, next, nodeId), nodeId);
    } catch (error) {
      return failure(error);
    }
  }

  function resolveCreateValue(
    parentPath: JsonPath,
    key: string | number,
    value: JsonValue | undefined,
  ): OperationFailure | { ok: true; value: JsonValue } {
    if (value !== undefined) {
      return { ok: true, value };
    }

    if (defaultFor !== undefined) {
      return { ok: true, value: cloneJson(defaultFor(parentPath)) };
    }

    const childSchema = schemaAtPath(schema, [...parentPath, key]);
    const parsed = childSchema?.safeParse(undefined);

    if (parsed?.success) {
      return { ok: true, value: cloneJson(parsed.data as JsonValue) };
    }

    return { ok: false, reason: "No default value is configured for create." };
  }

  function childArrayIdForObjectAppend(next: JsonDoc, objectId: NodeId): NodeId {
    const target = getNode(next, objectId);

    if (target.type !== "object") {
      throw new Error(`Cannot append a child to ${target.type} node.`);
    }

    for (const childKey of objectChildArrayKeys(next, target)) {
      return ensureObjectArrayField(next, objectId, childKey, allocateNodeId);
    }

    throw new Error("No child array field is available for appendChild.");
  }

  function objectChildArrayKeys(currentDoc: JsonDoc, target: JsonNode): string[] {
    const keys = new Set<string>();
    const targetSchema = schemaAtPath(schema, getPath(currentDoc, target.id));

    if (targetSchema !== null) {
      for (const childKey of objectArrayFieldKeys(targetSchema)) {
        keys.add(childKey);
      }
    }

    for (const childId of target.children) {
      const child = getNode(currentDoc, childId);

      if (child.type === "array" && typeof child.key === "string") {
        keys.add(child.key);
      }
    }

    for (const childKey of childKeys) {
      keys.add(childKey);
    }

    return [...keys];
  }

  return {
    create,
    insertAfter,
    insertBefore,
    appendChild,
    update,
    rename,
    delete: deleteNode,
  };
}
