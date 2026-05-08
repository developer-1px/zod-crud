import * as z from "zod";

import type {
  JsonChange,
  JsonDoc,
  JsonPath,
  JsonValue,
  NodeId,
  OperationResult,
} from "../types.js";
import {
  cloneDoc,
  deserialize,
  getNode,
  getPath,
  insertChild,
  removeSubtree,
  renameObjectKey,
  replaceSubtree,
} from "../document/json-doc.js";
import { validateAtPath } from "../schema/json-validation.js";
import {
  changesForDeletedSubtree,
  changesForInsertedSubtree,
  changesForReplacedSubtree,
} from "./operation-result.js";
import { failure } from "./failure.js";
import { childArrayIdForObjectAppend, resolveCreateValue } from "./json-create-helpers.js";

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

  function defaulted(parentPath: JsonPath, key: string | number, value: JsonValue | undefined) {
    return resolveCreateValue({ schema, parentPath, key, value, ...(defaultFor && { defaultFor }) });
  }

  function create(parentId: NodeId, key: string | number, value?: JsonValue): OperationResult {
    try {
      const doc = getDoc();
      const next = cloneDoc(doc);
      const parentPath = getPath(next, parentId);
      const childValue = defaulted(parentPath, key, value);

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
        : childArrayIdForObjectAppend({ schema, doc: next, objectId: parent.id, childKeys, allocateNodeId });
      const childArray = getNode(next, childArrayId);
      const childArrayPath = getPath(next, childArrayId);
      const childValue = defaulted(childArrayPath, childArray.children.length, value);

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
