import * as z from "zod";

import type {
  JsonChange,
  JsonCrudOptions,
  JsonDoc,
  JsonKey,
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
  findChildByKey,
  getPath,
  maxNodeIndex,
  serialize,
} from "../document/json-doc.js";
import { planDeleteMany, type DeleteManyPlan } from "./json-delete-many.js";
import { createHistory } from "./json-history.js";
import { createClipboard } from "./json-clipboard.js";
import { createMutations } from "./json-mutations.js";
import { validateDocument } from "../schema/json-validation.js";
import { successResult } from "./operation-result.js";
import { failure } from "./failure.js";

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

  const validation = validateDocument(schema, doc);

  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  const { commit, undo, redo, canUndo, canRedo } = createHistory({
    getDoc: () => doc,
    setDoc: (next) => { doc = next; },
    notify: notifyListeners,
    ...(options.focusFilter && { focusFilter: options.focusFilter }),
  });

  const mutations = createMutations({
    schema,
    childKeys,
    getDoc: () => doc,
    commitIfValid,
    allocateNodeId,
    ...(options.defaultFor && { defaultFor: options.defaultFor }),
  });
  const { create, insertAfter, insertBefore, appendChild, update, rename } = mutations;
  const deleteNode = mutations.delete;

  const { copy, copyMany, canCopyMany, cut, cutMany, canCutMany, paste, canPaste } = createClipboard({
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
