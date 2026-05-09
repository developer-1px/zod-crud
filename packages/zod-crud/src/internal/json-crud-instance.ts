import type * as z from "zod";

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
import type { JsonCrud } from "../json-crud.js";
import {
  cloneDoc,
  cloneJson,
  deserialize,
  findChildByKey,
  getPath,
  maxNodeIndex,
  serialize,
} from "../document/json-doc.js";
import { planDeleteMany, type DeleteManyPlan } from "../bulk/delete-many.js";
import { createHistory } from "../history/json-history.js";
import { createClipboard } from "../clipboard/clipboard.js";
import { createMutations } from "../mutate/mutations.js";
import { createMove } from "../bulk/move.js";
import { select, type SelectionPlan } from "../bulk/select.js";
import { validateDocument } from "../validation/json-validation.js";
import { successResult } from "../result/operation-result.js";
import { failure } from "../result/failure.js";

const DEFAULT_CHILD_KEYS = ["children"];

type OperationFailure = Extract<OperationResult, { ok: false }>;

export function createJsonCrudInstance<T extends JsonValue, I = unknown>(
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
  const preflightMutations = createMutations({
    schema,
    childKeys,
    getDoc: () => doc,
    commitIfValid: validateOnly,
    allocateNodeId,
    ...(options.defaultFor && { defaultFor: options.defaultFor }),
  });
  const {
    create: preflightCreate,
    insertAfter: preflightInsertAfter,
    insertBefore: preflightInsertBefore,
    appendChild: preflightAppendChild,
    update: preflightUpdate,
    rename: preflightRename,
    delete: preflightDelete,
  } = preflightMutations;

  const {
    moveBefore,
    canMoveBefore: preflightMoveBefore,
    moveAfter,
    canMoveAfter: preflightMoveAfter,
    moveInto,
    canMoveInto: preflightMoveInto,
  } = createMove({
    schema,
    childKeys,
    getDoc: () => doc,
    commitIfValid,
    allocateNodeId,
    ...(options.focusFilter && { focusFilter: options.focusFilter }),
  });

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

  function selectHere(nodeIds: NodeId[]): SelectionPlan | OperationFailure {
    try {
      return select(doc, nodeIds);
    } catch (error) {
      return failure(error) as OperationFailure;
    }
  }

  function canCreate(parentId: NodeId, key: string | number, value?: JsonValue): OperationResult {
    return preflight(() => preflightCreate(parentId, key, value));
  }

  function canInsertAfter(siblingId: NodeId, value?: JsonValue): OperationResult {
    return preflight(() => preflightInsertAfter(siblingId, value));
  }

  function canInsertBefore(siblingId: NodeId, value?: JsonValue): OperationResult {
    return preflight(() => preflightInsertBefore(siblingId, value));
  }

  function canAppendChild(parentId: NodeId, value?: JsonValue): OperationResult {
    return preflight(() => preflightAppendChild(parentId, value));
  }

  function canUpdate(nodeId: NodeId, value: JsonValue): OperationResult {
    return preflight(() => preflightUpdate(nodeId, value));
  }

  function canRename(nodeId: NodeId, key: string): OperationResult {
    return preflight(() => preflightRename(nodeId, key));
  }

  function canDelete(nodeId: NodeId): OperationResult {
    return preflight(() => preflightDelete(nodeId));
  }

  function canMoveBefore(nodeIds: NodeId[], siblingId: NodeId): OperationResult {
    return preflight(() => preflightMoveBefore(nodeIds, siblingId));
  }

  function canMoveAfter(nodeIds: NodeId[], siblingId: NodeId): OperationResult {
    return preflight(() => preflightMoveAfter(nodeIds, siblingId));
  }

  function canMoveInto(nodeIds: NodeId[], parentId: NodeId, index?: number): OperationResult {
    return preflight(() => preflightMoveInto(nodeIds, parentId, index));
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

  function validateOnly(next: JsonDoc): OperationResult {
    const validation = validateDocument(schema, next);
    return validation.ok ? { ok: true } : validation;
  }

  function preflight(action: () => OperationResult): OperationResult {
    const savedNodeIndex = nextNodeIndex;

    try {
      const result = action();
      return result.ok ? { ok: true } : result;
    } finally {
      nextNodeIndex = savedNodeIndex;
    }
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
    select: selectHere,
    create,
    canCreate,
    insertAfter,
    canInsertAfter,
    insertBefore,
    canInsertBefore,
    appendChild,
    canAppendChild,
    update,
    canUpdate,
    rename,
    canRename,
    delete: deleteNode,
    canDelete,
    deleteMany,
    moveBefore,
    canMoveBefore,
    moveAfter,
    canMoveAfter,
    moveInto,
    canMoveInto,
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
