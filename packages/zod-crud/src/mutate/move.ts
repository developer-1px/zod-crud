import * as z from "zod";

import type {
  FocusFilter,
  JsonChange,
  JsonDoc,
  JsonValue,
  NodeId,
  OperationResult,
} from "../types.js";
import { ensureObjectArrayField } from "../document/ensure-object-array-field.js";
import { getNode } from "../document/json-doc-access.js";
import { cloneDoc } from "../document/json-doc-clone.js";
import { normalizeArrayKeys } from "../document/json-doc-mutation-helpers.js";
import { validateDocument } from "../validation.js";
import { objectArrayFieldKeysOfTarget } from "../schema/schema-array-fields.js";
import { select, type SelectionPlan } from "../select.js";
import { failure } from "../result.js";
import { changesForMove, insertionIndex, isDescendant, type MovePlan } from "./move-plan.js";

type OperationFailure = Extract<OperationResult, { ok: false }>;

export type MoveCtx<T extends JsonValue> = {
  schema: z.ZodType<T, any>;
  childKeys: string[];
  allocateNodeId: () => NodeId;
  focusFilter?: FocusFilter;
};

function normalizeMoveSelection(doc: JsonDoc, nodeIds: NodeId[]): SelectionPlan | OperationFailure {
  const selection = select(doc, nodeIds);

  if (!selection.ok) {
    return selection;
  }

  if (selection.nodes.some((node) => node.id === doc.rootId || node.parentId === null)) {
    return { ok: false, code: "root_operation", reason: "Cannot move the root node." };
  }

  return selection;
}

function targetForMoveInto<T extends JsonValue>(
  doc: JsonDoc,
  ctx: MoveCtx<T>,
  parentId: NodeId,
):
  | { ok: true; type: "array"; nodeId: NodeId }
  | { ok: true; type: "object"; objectId: NodeId; childKey: string }
  | OperationFailure {
  const parent = getNode(doc, parentId);

  if (parent.type === "array") {
    return { ok: true, type: "array", nodeId: parent.id };
  }

  if (parent.type !== "object") {
    return { ok: false, code: "invalid_target", reason: `Cannot move nodes into ${parent.type} node.`, nodeId: parentId };
  }

  const [childKey] = objectArrayFieldKeysOfTarget(doc, ctx.schema, parent, ctx.childKeys);

  if (childKey === undefined) {
    return { ok: false, code: "invalid_target", reason: "No child array field is available for moveInto.", nodeId: parentId };
  }

  return { ok: true, type: "object", objectId: parent.id, childKey };
}

function moveToObjectArray<T extends JsonValue>(
  doc: JsonDoc,
  ctx: MoveCtx<T>,
  selection: SelectionPlan,
  objectId: NodeId,
  childKey: string,
  requestedIndex?: number,
): MovePlan | OperationFailure {
  const next = cloneDoc(doc);
  const movedIds = selection.nodeIds;
  const touchedParentIds = new Set<NodeId>([objectId]);

  for (const node of selection.nodes) {
    if (node.parentId !== null) {
      touchedParentIds.add(node.parentId);
      const parent = getNode(next, node.parentId);
      parent.children = parent.children.filter((childId) => childId !== node.id);
    }
  }

  const targetArrayId = ensureObjectArrayField(next, objectId, childKey, ctx.allocateNodeId);
  touchedParentIds.add(targetArrayId);

  for (const parentId of touchedParentIds) {
    const parent = getNode(next, parentId);
    if (parent.type === "array") {
      normalizeArrayKeys(next, parent.id);
    }
  }

  const nextTarget = getNode(next, targetArrayId);
  const insertIndex = insertionIndex(nextTarget, undefined, "into", requestedIndex);

  if (!insertIndex.ok) {
    return insertIndex;
  }

  nextTarget.children.splice(insertIndex.index, 0, ...movedIds);

  for (const nodeId of movedIds) {
    const node = getNode(next, nodeId);
    node.parentId = targetArrayId;
  }

  normalizeArrayKeys(next, targetArrayId);

  const validation = validateDocument(ctx.schema, next);
  if (!validation.ok) {
    return validation;
  }

  const changes = changesForMove(doc, next);
  const focusNodeIds = movedIds.length > 1 ? movedIds : undefined;
  const focusNodeId = movedIds.slice().reverse().find((nodeId) => ctx.focusFilter?.(next, nodeId) ?? true) ?? movedIds[movedIds.length - 1]!;

  return {
    ok: true,
    next,
    changes,
    nodeId: movedIds[0]!,
    focusNodeId,
    ...(focusNodeIds === undefined ? {} : { focusNodeIds }),
  };
}

function moveToArray<T extends JsonValue>(
  doc: JsonDoc,
  ctx: MoveCtx<T>,
  selection: SelectionPlan,
  targetArrayId: NodeId,
  siblingId: NodeId | undefined,
  placement: "before" | "after" | "into",
  requestedIndex?: number,
): MovePlan | OperationFailure {
  const targetArray = getNode(doc, targetArrayId);

  if (targetArray.type !== "array") {
    return { ok: false, code: "invalid_target", reason: "Move target must be an array.", nodeId: targetArrayId };
  }

  if (selection.nodes.some((node) => node.parentId === null)) {
    return { ok: false, code: "root_operation", reason: "Cannot move the root node." };
  }

  if (siblingId !== undefined && selection.nodes.some((node) => isDescendant(doc, siblingId, node.id))) {
    return { ok: false, code: "invalid_target", reason: "Move target cannot be inside the moved selection.", nodeId: siblingId };
  }

  const next = cloneDoc(doc);
  const movedIds = selection.nodeIds;
  const touchedParentIds = new Set<NodeId>([targetArrayId]);

  for (const node of selection.nodes) {
    if (node.parentId !== null) {
      touchedParentIds.add(node.parentId);
      const parent = getNode(next, node.parentId);
      parent.children = parent.children.filter((childId) => childId !== node.id);
    }
  }

  for (const parentId of touchedParentIds) {
    const parent = getNode(next, parentId);
    if (parent.type === "array") {
      normalizeArrayKeys(next, parent.id);
    }
  }

  const nextTarget = getNode(next, targetArrayId);
  const insertIndex = insertionIndex(nextTarget, siblingId, placement, requestedIndex);

  if (!insertIndex.ok) {
    return insertIndex;
  }

  nextTarget.children.splice(insertIndex.index, 0, ...movedIds);

  for (const nodeId of movedIds) {
    const node = getNode(next, nodeId);
    node.parentId = targetArrayId;
  }

  normalizeArrayKeys(next, targetArrayId);

  const validation = validateDocument(ctx.schema, next);
  if (!validation.ok) {
    return validation;
  }

  const changes = changesForMove(doc, next);
  const focusNodeIds = movedIds.length > 1 ? movedIds : undefined;
  const focusNodeId = movedIds.slice().reverse().find((nodeId) => ctx.focusFilter?.(next, nodeId) ?? true) ?? movedIds[movedIds.length - 1]!;

  return {
    ok: true,
    next,
    changes,
    nodeId: movedIds[0]!,
    focusNodeId,
    ...(focusNodeIds === undefined ? {} : { focusNodeIds }),
  };
}

export function planMoveBeside<T extends JsonValue>(
  doc: JsonDoc,
  ctx: MoveCtx<T>,
  nodeIds: NodeId[],
  siblingId: NodeId,
  placement: "before" | "after",
): MovePlan | OperationFailure {
  const sibling = getNode(doc, siblingId);

  if (sibling.parentId === null) {
    return { ok: false, code: "invalid_target", reason: "Cannot move next to the root node.", nodeId: siblingId };
  }

  const parent = getNode(doc, sibling.parentId);

  if (parent.type !== "array") {
    return {
      ok: false,
      code: "invalid_target",
      reason: `move${placement === "before" ? "Before" : "After"} requires a sibling whose parent is an array.`,
      nodeId: siblingId,
    };
  }

  const selection = normalizeMoveSelection(doc, nodeIds);

  if (!selection.ok) {
    return selection;
  }

  if (selection.nodeIds.includes(siblingId)) {
    return { ok: false, code: "invalid_target", reason: "Move target cannot be part of the moved selection.", nodeId: siblingId };
  }

  return moveToArray(doc, ctx, selection, parent.id, siblingId, placement);
}

export function planMoveInto<T extends JsonValue>(
  doc: JsonDoc,
  ctx: MoveCtx<T>,
  nodeIds: NodeId[],
  parentId: NodeId,
  index?: number,
): MovePlan | OperationFailure {
  const selection = normalizeMoveSelection(doc, nodeIds);

  if (!selection.ok) {
    return selection;
  }

  if (selection.nodes.some((node) => node.id === parentId || isDescendant(doc, parentId, node.id))) {
    return { ok: false, code: "invalid_target", reason: "Cannot move a node into itself or its descendant.", nodeId: parentId };
  }

  const target = targetForMoveInto(doc, ctx, parentId);
  if (!target.ok) {
    return target;
  }

  return target.type === "array"
    ? moveToArray(doc, ctx, selection, target.nodeId, undefined, "into", index)
    : moveToObjectArray(doc, ctx, selection, target.objectId, target.childKey, index);
}

export type MoveDeps<T extends JsonValue> = MoveCtx<T> & {
  getDoc: () => JsonDoc;
  commitIfValid: (
    next: JsonDoc,
    changes: JsonChange[],
    nodeId?: NodeId,
    focusNodeId?: NodeId,
    focusNodeIds?: NodeId[],
  ) => OperationResult;
};

export type MoveApi = {
  moveBefore: (nodeIds: NodeId[], siblingId: NodeId) => OperationResult;
  moveAfter: (nodeIds: NodeId[], siblingId: NodeId) => OperationResult;
  moveInto: (nodeIds: NodeId[], parentId: NodeId, index?: number) => OperationResult;
  canMoveBefore: (nodeIds: NodeId[], siblingId: NodeId) => OperationResult;
  canMoveAfter: (nodeIds: NodeId[], siblingId: NodeId) => OperationResult;
  canMoveInto: (nodeIds: NodeId[], parentId: NodeId, index?: number) => OperationResult;
};

export function createMove<T extends JsonValue>(deps: MoveDeps<T>): MoveApi {
  const { getDoc, commitIfValid, schema, childKeys, allocateNodeId, focusFilter } = deps;
  const ctx: MoveCtx<T> = {
    schema,
    childKeys,
    allocateNodeId,
    ...(focusFilter && { focusFilter }),
  };

  function commit(plan: MovePlan | OperationFailure): OperationResult {
    if (!plan.ok) return plan;
    return commitIfValid(plan.next, plan.changes, plan.nodeId, plan.focusNodeId, plan.focusNodeIds);
  }

  function canCommit(plan: MovePlan | OperationFailure): OperationResult {
    if (!plan.ok) return plan;
    const validation = validateDocument(schema, plan.next);
    return validation.ok ? { ok: true } : validation;
  }

  function safe<R>(fn: () => R extends OperationResult ? R : never): OperationResult {
    try {
      return fn() as OperationResult;
    } catch (error) {
      return failure(error);
    }
  }

  return {
    moveBefore: (ids, sib) => safe(() => commit(planMoveBeside(getDoc(), ctx, ids, sib, "before"))),
    moveAfter: (ids, sib) => safe(() => commit(planMoveBeside(getDoc(), ctx, ids, sib, "after"))),
    moveInto: (ids, parentId, index) => safe(() => commit(planMoveInto(getDoc(), ctx, ids, parentId, index))),
    canMoveBefore: (ids, sib) => safe(() => canCommit(planMoveBeside(getDoc(), ctx, ids, sib, "before"))),
    canMoveAfter: (ids, sib) => safe(() => canCommit(planMoveBeside(getDoc(), ctx, ids, sib, "after"))),
    canMoveInto: (ids, parentId, index) => safe(() => canCommit(planMoveInto(getDoc(), ctx, ids, parentId, index))),
  };
}
