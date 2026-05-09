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
import type {
  JsonCrud,
  NodePredicate,
  Transaction,
  TransactionResult,
  WalkVisitor,
} from "../json-crud.js";
import type { JsonNode, JsonNodeType } from "../types.js";
import { maxNodeIndex } from "../document/json-doc-access.js";
import { cloneDoc } from "../document/json-doc-clone.js";
import { serialize } from "../document/json-doc-serialization.js";
import { createReadApi } from "../read/read-api.js";
import { createDeleteMany } from "../mutate/delete-many.js";
import { createSubscriber } from "../subscribe.js";
import { createDirtyTracker } from "../dirty.js";
import { createHistory } from "../history/json-history.js";
import { createClipboard } from "../clipboard/clipboard.js";
import { createMutations } from "../mutate/mutations.js";
import { createMove } from "../mutate/move.js";
import { select, type SelectionPlan } from "../select.js";
import { validateDocument } from "../validation.js";
import { successResult } from "../result.js";
import { failure } from "../result.js";
import { invertChanges as invertChangesImpl } from "../history/change/change-inversion.js";
import { diffDocs } from "../history/diff-doc.js";
import { applyChangesToDoc } from "../history/apply-changes.js";
import { createLockedRegion } from "../locked-region.js";
import { transact as runTransact } from "../mutate/transaction.js";
import { enumerateInsertableKeys, enumerateInsertableTypes } from "../schema/insertable.js";
import { createTreeShape } from "../mutate/tree-shape.js";

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
  const lockedRegion = createLockedRegion(() => doc);
  const { subscribe, notify } = createSubscriber();
  const { markClean, isDirty, savedSnapshot } = createDirtyTracker(() => doc);
  const { snapshot, toJson, read, pathOf, find, findAll, walk } = createReadApi({ schema, getDoc: () => doc });

  const validation = validateDocument(schema, doc);

  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  const { commit, undo, redo, canUndo, canRedo } = createHistory({
    getDoc: () => doc,
    setDoc: (next) => { doc = next; },
    notify,
    ...(options.focusFilter && { focusFilter: options.focusFilter }),
  });

  const { deleteMany, canDeleteMany } = createDeleteMany({
    schema,
    getDoc: () => doc,
    commitIfValid,
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

  const clipboard = createClipboard({
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
  const { copy, copyMany, canCopyMany, cut, cutMany, canCutMany } = clipboard;
  function paste(targetId: NodeId, options?: PasteOptions): OperationResult {
    return lockedRegion.guard([targetId]) ?? clipboard.paste(targetId, options);
  }
  function canPaste(targetId: NodeId, options?: PasteOptions): OperationResult {
    return lockedRegion.guard([targetId]) ?? clipboard.canPaste(targetId, options);
  }

  const treeShape = createTreeShape({
    schema,
    childKeys,
    getDoc: () => doc,
    commitIfValid,
    allocateNodeId,
  });
  const preflightTreeShape = createTreeShape({
    schema,
    childKeys,
    getDoc: () => doc,
    commitIfValid: validateOnly,
    allocateNodeId,
  });
  const { wrap, unwrap, split, join } = treeShape;
  const indent = (nodeId: NodeId) => treeShape.indent(nodeId, moveInto);
  const outdent = (nodeId: NodeId) => treeShape.outdent(nodeId, moveAfter);

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

  function commitIfValid(
    next: JsonDoc,
    changes: JsonChange[],
    nodeId?: NodeId,
    focusNodeId?: NodeId,
    focusNodeIds?: NodeId[],
  ): OperationResult {
    for (const change of changes) {
      if (lockedRegion.isLocked(change.nodeId)) {
        return {
          ok: false,
          code: "locked_region",
          reason: `Cannot mutate node ${change.nodeId}: it is in a locked region.`,
          nodeId: change.nodeId,
        };
      }
    }

    const validation = validateDocument(schema, next);

    if (!validation.ok) {
      return validation;
    }

    const before = cloneDoc(doc);
    const result = successResult(before, next, changes, nodeId, focusNodeId, focusNodeIds, options.focusFilter);

    commit(next, changes, nodeId, result.ok ? result.focusNodeId : focusNodeId, focusNodeIds);
    return result;
  }

  function validateOnly(next: JsonDoc, changes: JsonChange[] = []): OperationResult {
    for (const change of changes) {
      if (lockedRegion.isLocked(change.nodeId)) {
        return {
          ok: false,
          code: "locked_region",
          reason: `Cannot mutate node ${change.nodeId}: it is in a locked region.`,
          nodeId: change.nodeId,
        };
      }
    }
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

  function transact<R>(fn: (tx: Transaction) => R): TransactionResult<R> {
    return runTransact<T, R>(
      {
        schema,
        childKeys,
        getDoc: () => doc,
        setDoc: (next) => { doc = next; },
        getAllocator: () => nextNodeIndex,
        setAllocator: (n) => { nextNodeIndex = n; },
        commit,
        lockedRegion,
        ...(options.focusFilter && { focusFilter: options.focusFilter }),
        ...(options.defaultFor && { defaultFor: options.defaultFor }),
      },
      fn,
    );
  }

  function applyChanges(changes: JsonChange[]): OperationResult {
    if (changes.length === 0) return { ok: true };
    const result = applyChangesToDoc(doc, changes);
    if (!result.ok) {
      return {
        ok: false,
        code: "change_conflict",
        reason: result.reason,
        nodeId: result.conflict,
      };
    }
    return commitIfValid(result.next, changes);
  }
  function invertChangesPublic(changes: JsonChange[]): JsonChange[] {
    return invertChangesImpl(changes);
  }
  function diff(other: JsonDoc): JsonChange[] {
    return diffDocs(doc, other);
  }

  function insertableKeys(parentId: NodeId): string[] {
    return enumerateInsertableKeys(schema, doc, parentId);
  }
  function insertableTypes(parentId: NodeId, key?: string): JsonNodeType[] {
    return enumerateInsertableTypes(schema, doc, parentId, key);
  }

  const { lock, unlock, isLocked } = lockedRegion;

  function locked<F extends (...args: never[]) => OperationResult>(
    targetIdsFromArgs: (...args: Parameters<F>) => ReadonlyArray<NodeId | undefined>,
    fn: F,
  ): F {
    return ((...args: Parameters<F>) => {
      return lockedRegion.guard(targetIdsFromArgs(...args)) ?? fn(...args);
    }) as F;
  }

  const guardSingle = (id: NodeId) => [id];
  const guardMany = (ids: NodeId[]) => ids;

  return {
    snapshot,
    toJson,
    read,
    pathOf,
    find,
    findAll,
    walk,
    select: selectHere,
    create: locked((parentId) => [parentId], create),
    canCreate: locked((parentId) => [parentId], canCreate),
    insertAfter: locked((siblingId) => [siblingId], insertAfter),
    canInsertAfter: locked((siblingId) => [siblingId], canInsertAfter),
    insertBefore: locked((siblingId) => [siblingId], insertBefore),
    canInsertBefore: locked((siblingId) => [siblingId], canInsertBefore),
    appendChild: locked((parentId) => [parentId], appendChild),
    canAppendChild: locked((parentId) => [parentId], canAppendChild),
    update: locked(guardSingle, update),
    canUpdate: locked(guardSingle, canUpdate),
    rename: locked(guardSingle, rename),
    canRename: locked(guardSingle, canRename),
    delete: locked(guardSingle, deleteNode),
    canDelete: locked(guardSingle, canDelete),
    deleteMany: locked(guardMany, deleteMany),
    canDeleteMany: locked(guardMany, canDeleteMany),
    moveBefore: locked((ids, sib) => [...ids, sib], moveBefore),
    canMoveBefore: locked((ids, sib) => [...ids, sib], canMoveBefore),
    moveAfter: locked((ids, sib) => [...ids, sib], moveAfter),
    canMoveAfter: locked((ids, sib) => [...ids, sib], canMoveAfter),
    moveInto: locked((ids, parentId) => [...ids, parentId], moveInto),
    canMoveInto: locked((ids, parentId) => [...ids, parentId], canMoveInto),
    transact,
    wrap: locked(guardSingle, wrap),
    canWrap: locked(guardSingle, (id: NodeId, key: string) => preflight(() => preflightTreeShape.wrap(id, key))),
    unwrap: locked(guardSingle, unwrap),
    canUnwrap: locked(guardSingle, (id: NodeId) => preflight(() => preflightTreeShape.unwrap(id))),
    indent: locked(guardSingle, indent),
    canIndent: locked(guardSingle, (id: NodeId) => preflight(() => indent(id))),
    outdent: locked(guardSingle, outdent),
    canOutdent: locked(guardSingle, (id: NodeId) => preflight(() => outdent(id))),
    split: locked(guardSingle, split),
    canSplit: locked(guardSingle, (id: NodeId, at: number) => preflight(() => preflightTreeShape.split(id, at))),
    join: locked((id, w) => [id, w], join),
    canJoin: locked((id, w) => [id, w], (id: NodeId, w: NodeId) => preflight(() => preflightTreeShape.join(id, w))),
    copy,
    copyMany,
    canCopyMany,
    cut: locked(guardSingle, cut),
    cutMany: locked(guardMany, cutMany),
    canCutMany: locked(guardMany, canCutMany),
    paste,
    canPaste,
    undo,
    redo,
    canUndo,
    canRedo,
    subscribe,
    applyChanges,
    invertChanges: invertChangesPublic,
    diff,
    markClean,
    isDirty,
    savedSnapshot,
    insertableKeys,
    insertableTypes,
    lock,
    unlock,
    isLocked,
  };
}
