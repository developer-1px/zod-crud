import * as z from "zod";

import type {
  JsonChange,
  JsonCrudOptions,
  JsonDoc,
  JsonKey,
  JsonNode,
  JsonPath,
  JsonValue,
  NodeId,
  OperationResult,
  PasteOptions,
} from "../types.js";
import {
  cloneDoc,
  cloneJson,
  deserialize,
  ensureObjectArrayField,
  findChildByKey,
  getNode,
  getPath,
  insertChild,
  maxNodeIndex,
  removeSubtree,
  renameObjectKey,
  replaceSubtree,
  serialize,
} from "../document/json-doc.js";
import { planDeleteMany, type DeleteManyPlan } from "./json-delete-many.js";
import { createHistory } from "./json-history.js";
import { createClipboard } from "./json-clipboard.js";
import { validateAtPath, validateDocument } from "../schema/json-validation.js";
import { objectArrayFieldKeys, schemaAtPath } from "../schema/schema-path.js";
import {
  changesForDeletedSubtree,
  changesForInsertedSubtree,
  changesForReplacedSubtree,
  successResult,
} from "./operation-result.js";

const DEFAULT_CHILD_KEYS = ["children"];

type OperationFailure = Extract<OperationResult, { ok: false }>;

export type JsonCrud<T extends JsonValue = JsonValue, I = unknown> = {
  snapshot: () => JsonDoc;
  toJson: () => T;
  read: (nodeId?: NodeId) => JsonValue;
  pathOf: (nodeId: NodeId) => JsonPath;
  find: (parentId: NodeId, key: JsonKey) => NodeId | null;
  create: (parentId: NodeId, key: string | number, value?: JsonValue) => OperationResult;
  insertAfter: (siblingId: NodeId, value?: JsonValue) => OperationResult;
  insertBefore: (siblingId: NodeId, value?: JsonValue) => OperationResult;
  appendChild: (parentId: NodeId, value?: JsonValue) => OperationResult;
  update: (nodeId: NodeId, value: JsonValue) => OperationResult;
  rename: (nodeId: NodeId, key: string) => OperationResult;
  delete: (nodeId: NodeId) => OperationResult;
  deleteMany: (nodeIds: NodeId[]) => OperationResult;
  copy: (nodeId: NodeId) => JsonValue;
  copyMany: (nodeIds: NodeId[]) => JsonValue[];
  canCopyMany: (nodeIds: NodeId[]) => OperationResult;
  cut: (nodeId: NodeId) => OperationResult;
  cutMany: (nodeIds: NodeId[]) => OperationResult;
  canCutMany: (nodeIds: NodeId[]) => OperationResult;
  paste: (targetId: NodeId, options?: PasteOptions) => OperationResult;
  canDeleteMany: (nodeIds: NodeId[]) => OperationResult;
  canPaste: (targetId: NodeId, options?: PasteOptions) => OperationResult;
  canUndo: () => boolean;
  canRedo: () => boolean;
  subscribe: (notify: () => void) => () => void;
  undo: () => OperationResult;
  redo: () => OperationResult;
};

export function createJsonCrud<T extends JsonValue, I = unknown>(
  schema: z.ZodType<T, I>,
  initialValue: I,
  options: JsonCrudOptions = {},
): JsonCrud<T, I> {
  const parsed = schema.safeParse(initialValue);

  if (!parsed.success) {
    throw parsed.error;
  }

  let doc = serialize(parsed.data);
  const childKeys = options.childKeys ?? DEFAULT_CHILD_KEYS;
  let nextNodeIndex = maxNodeIndex(doc) + 1;
  const listeners = new Set<() => void>();
  const history = createHistory({
    getDoc: () => doc,
    setDoc: (next) => { doc = next; },
    notify: notifyListeners,
    ...(options.focusFilter && { focusFilter: options.focusFilter }),
  });
  const { commit, undo, redo, canUndo, canRedo } = history;
  const clipboardApi = createClipboard({
    schema,
    childKeys,
    getDoc: () => doc,
    read,
    deleteNode,
    deleteMany,
    canDeleteMany,
    allocateNodeId,
    saveAllocator: () => nextNodeIndex,
    restoreAllocator: (saved) => { nextNodeIndex = saved; },
    commit,
    ...(options.focusFilter && { focusFilter: options.focusFilter }),
  });
  const { copy, copyMany, canCopyMany, cut, cutMany, canCutMany, paste, canPaste } = clipboardApi;

  const validation = validateDocument(schema, doc);

  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  function snapshot(): JsonDoc {
    return cloneDoc(doc);
  }

  function toJson(): T {
    return schema.parse(deserialize(doc));
  }

  function read(nodeId: NodeId = doc.rootId): JsonValue {
    return cloneJson(deserialize(doc, nodeId));
  }

  function pathOf(nodeId: NodeId): JsonPath {
    return getPath(doc, nodeId);
  }

  function find(parentId: NodeId, key: JsonKey): NodeId | null {
    const child = findChildByKey(doc, parentId, key);
    return child?.id ?? null;
  }

  function create(parentId: NodeId, key: string | number, value?: JsonValue): OperationResult {
    try {
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
    try {
      const sibling = getNode(doc, siblingId);

      if (sibling.parentId === null) {
        return { ok: false, reason: "Cannot insert next to the root node." };
      }

      const parent = getNode(doc, sibling.parentId);

      if (parent.type !== "array") {
        return { ok: false, reason: "insertAfter requires a sibling whose parent is an array." };
      }

      const index = parent.children.indexOf(siblingId);

      if (index < 0) {
        return { ok: false, reason: "Sibling is not present in its parent." };
      }

      return create(parent.id, index + 1, value);
    } catch (error) {
      return failure(error);
    }
  }

  function insertBefore(siblingId: NodeId, value?: JsonValue): OperationResult {
    try {
      const sibling = getNode(doc, siblingId);

      if (sibling.parentId === null) {
        return { ok: false, reason: "Cannot insert next to the root node." };
      }

      const parent = getNode(doc, sibling.parentId);

      if (parent.type !== "array") {
        return { ok: false, reason: "insertBefore requires a sibling whose parent is an array." };
      }

      const index = parent.children.indexOf(siblingId);

      if (index < 0) {
        return { ok: false, reason: "Sibling is not present in its parent." };
      }

      return create(parent.id, index, value);
    } catch (error) {
      return failure(error);
    }
  }

  function appendChild(parentId: NodeId, value?: JsonValue): OperationResult {
    try {
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

  function deleteMany(nodeIds: NodeId[]): OperationResult {
    try {
      const plan = planDeleteManyHere(nodeIds);

      if (!plan.ok) {
        return plan;
      }

      return commitIfValid(plan.next, plan.changes, plan.nodeId, plan.focusNodeId);
    } catch (error) {
      return failure(error);
    }
  }

  function canDeleteMany(nodeIds: NodeId[]): OperationResult {
    try {
      const plan = planDeleteManyHere(nodeIds);

      if (!plan.ok) {
        return plan;
      }

      const validation = validateDocument(schema, plan.next);

      return validation.ok ? { ok: true } : validation;
    } catch (error) {
      return failure(error);
    }
  }

  function planDeleteManyHere(nodeIds: NodeId[]): DeleteManyPlan | OperationFailure {
    return planDeleteMany({ doc, schema, nodeIds, ...(options.focusFilter && { focusFilter: options.focusFilter }) });
  }

  function commitIfValid(
    next: JsonDoc,
    changes: JsonChange[],
    nodeId?: NodeId,
    focusNodeId?: NodeId,
    focusNodeIds?: NodeId[],
  ): OperationResult {
    const validation = validateDocument(schema, next);

    if (!validation.ok) {
      return validation;
    }

    const before = cloneDoc(doc);

    const result = successResult(before, next, changes, nodeId, focusNodeId, focusNodeIds, options.focusFilter);

    commit(next, changes, nodeId, result.ok ? result.focusNodeId : focusNodeId, focusNodeIds);
    return result;
  }

  function allocateNodeId(): NodeId {
    let id = `n${nextNodeIndex}`;
    nextNodeIndex += 1;

    while (doc.nodes[id] !== undefined) {
      id = `n${nextNodeIndex}`;
      nextNodeIndex += 1;
    }

    return id;
  }

  function subscribe(notify: () => void): () => void {
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  }

  function notifyListeners(): void {
    for (const listener of listeners) {
      listener();
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

    if (options.defaultFor !== undefined) {
      return { ok: true, value: cloneJson(options.defaultFor(parentPath)) };
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
    snapshot,
    toJson,
    read,
    pathOf,
    find,
    create,
    insertAfter,
    insertBefore,
    appendChild,
    update,
    rename,
    delete: deleteNode,
    deleteMany,
    copy,
    copyMany,
    canCopyMany,
    cut,
    cutMany,
    canCutMany,
    paste,
    canDeleteMany,
    canPaste,
    canUndo,
    canRedo,
    subscribe,
    undo,
    redo,
  };
}

function failure(error: unknown): OperationResult {
  return {
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  };
}

