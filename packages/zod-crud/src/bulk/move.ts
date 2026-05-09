import * as z from "zod";

import type {
  FocusFilter,
  JsonChange,
  JsonDoc,
  JsonNode,
  JsonValue,
  NodeId,
  OperationResult,
} from "../types.js";
import {
  cloneDoc,
  ensureObjectArrayField,
  getNode,
} from "../document/json-doc.js";
import { normalizeArrayKeys } from "../document/json-doc-mutation-helpers.js";
import { validateDocument } from "../validation/json-validation.js";
import { cloneNode, pushExistingUpdate } from "../mutate/diff/change-nodes.js";
import { objectArrayFieldKeysOfTarget } from "../schema/schema-array-fields.js";
import { select, type SelectionPlan } from "./select.js";
import { failure } from "../result/failure.js";

type OperationFailure = Extract<OperationResult, { ok: false }>;

export type MoveDeps<T extends JsonValue> = {
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
  focusFilter?: FocusFilter;
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
  const { schema, childKeys, getDoc, commitIfValid, allocateNodeId, focusFilter } = deps;

  function moveBefore(nodeIds: NodeId[], siblingId: NodeId): OperationResult {
    return commitMove(() => planMoveBeside(nodeIds, siblingId, "before"));
  }

  function moveAfter(nodeIds: NodeId[], siblingId: NodeId): OperationResult {
    return commitMove(() => planMoveBeside(nodeIds, siblingId, "after"));
  }

  function moveInto(nodeIds: NodeId[], parentId: NodeId, index?: number): OperationResult {
    return commitMove(() => planMoveInto(nodeIds, parentId, index));
  }

  function canMoveBefore(nodeIds: NodeId[], siblingId: NodeId): OperationResult {
    return canMove(() => planMoveBeside(nodeIds, siblingId, "before"));
  }

  function canMoveAfter(nodeIds: NodeId[], siblingId: NodeId): OperationResult {
    return canMove(() => planMoveBeside(nodeIds, siblingId, "after"));
  }

  function canMoveInto(nodeIds: NodeId[], parentId: NodeId, index?: number): OperationResult {
    return canMove(() => planMoveInto(nodeIds, parentId, index));
  }

  function commitMove(plan: () => MovePlan | OperationFailure): OperationResult {
    try {
      const result = plan();

      if (!result.ok) {
        return result;
      }

      return commitIfValid(result.next, result.changes, result.nodeId, result.focusNodeId, result.focusNodeIds);
    } catch (error) {
      return failure(error);
    }
  }

  function canMove(plan: () => MovePlan | OperationFailure): OperationResult {
    try {
      const result = plan();

      if (!result.ok) {
        return result;
      }

      const validation = validateDocument(schema, result.next);
      return validation.ok ? { ok: true } : validation;
    } catch (error) {
      return failure(error);
    }
  }

  function planMoveBeside(nodeIds: NodeId[], siblingId: NodeId, placement: "before" | "after"): MovePlan | OperationFailure {
    const doc = getDoc();
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

    return moveToArray(doc, selection, parent.id, siblingId, placement);
  }

  function planMoveInto(nodeIds: NodeId[], parentId: NodeId, index?: number): MovePlan | OperationFailure {
    const doc = getDoc();
    const selection = normalizeMoveSelection(doc, nodeIds);

    if (!selection.ok) {
      return selection;
    }

    if (selection.nodes.some((node) => node.id === parentId || isDescendant(doc, parentId, node.id))) {
      return { ok: false, code: "invalid_target", reason: "Cannot move a node into itself or its descendant.", nodeId: parentId };
    }

    const target = targetForMoveInto(doc, parentId);
    if (!target.ok) {
      return target;
    }

    return target.type === "array"
      ? moveToArray(doc, selection, target.nodeId, undefined, "into", index)
      : moveToObjectArray(doc, selection, target.objectId, target.childKey, index);
  }

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

  function targetForMoveInto(
    doc: JsonDoc,
    parentId: NodeId,
  ): { ok: true; type: "array"; nodeId: NodeId } | { ok: true; type: "object"; objectId: NodeId; childKey: string } | OperationFailure {
    const parent = getNode(doc, parentId);

    if (parent.type === "array") {
      return { ok: true, type: "array", nodeId: parent.id };
    }

    if (parent.type !== "object") {
      return { ok: false, code: "invalid_target", reason: `Cannot move nodes into ${parent.type} node.`, nodeId: parentId };
    }

    const [childKey] = objectArrayFieldKeysOfTarget(doc, schema, parent, childKeys);

    if (childKey === undefined) {
      return { ok: false, code: "invalid_target", reason: "No child array field is available for moveInto.", nodeId: parentId };
    }

    return { ok: true, type: "object", objectId: parent.id, childKey };
  }

  function moveToObjectArray(
    doc: JsonDoc,
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

    const targetArrayId = ensureObjectArrayField(next, objectId, childKey, allocateNodeId);
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

    const validation = validateDocument(schema, next);
    if (!validation.ok) {
      return validation;
    }

    const changes = changesForMove(doc, next);
    const focusNodeIds = movedIds.length > 1 ? movedIds : undefined;
    const focusNodeId = movedIds.slice().reverse().find((nodeId) => focusFilter?.(next, nodeId) ?? true) ?? movedIds[movedIds.length - 1]!;

    return {
      ok: true,
      next,
      changes,
      nodeId: movedIds[0]!,
      focusNodeId,
      ...(focusNodeIds === undefined ? {} : { focusNodeIds }),
    };
  }

  function moveToArray(
    doc: JsonDoc,
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

    const validation = validateDocument(schema, next);
    if (!validation.ok) {
      return validation;
    }

    const changes = changesForMove(doc, next);
    const focusNodeIds = movedIds.length > 1 ? movedIds : undefined;
    const focusNodeId = movedIds.slice().reverse().find((nodeId) => focusFilter?.(next, nodeId) ?? true) ?? movedIds[movedIds.length - 1]!;

    return {
      ok: true,
      next,
      changes,
      nodeId: movedIds[0]!,
      focusNodeId,
      ...(focusNodeIds === undefined ? {} : { focusNodeIds }),
    };
  }

  return {
    moveBefore,
    moveAfter,
    moveInto,
    canMoveBefore,
    canMoveAfter,
    canMoveInto,
  };
}

type MovePlan = {
  ok: true;
  next: JsonDoc;
  changes: JsonChange[];
  nodeId: NodeId;
  focusNodeId: NodeId;
  focusNodeIds?: NodeId[];
};

function insertionIndex(
  targetArray: JsonNode,
  siblingId: NodeId | undefined,
  placement: "before" | "after" | "into",
  requestedIndex: number | undefined,
): { ok: true; index: number } | OperationFailure {
  if (placement === "into") {
    const index = requestedIndex ?? targetArray.children.length;
    if (!Number.isInteger(index) || index < 0 || index > targetArray.children.length) {
      return { ok: false, code: "invalid_target", reason: `Move index out of bounds: ${String(index)}.` };
    }

    return { ok: true, index };
  }

  const siblingIndex = siblingId === undefined ? -1 : targetArray.children.indexOf(siblingId);

  if (siblingIndex < 0) {
    return {
      ok: false,
      code: "invalid_target",
      reason: "Move sibling is not present in its parent.",
      ...(siblingId === undefined ? {} : { nodeId: siblingId }),
    };
  }

  return { ok: true, index: placement === "before" ? siblingIndex : siblingIndex + 1 };
}

function changesForMove(before: JsonDoc, after: JsonDoc): JsonChange[] {
  const changes: JsonChange[] = [];
  const pushedUpdates = new Set<NodeId>();
  const allNodeIds = new Set([...Object.keys(before.nodes), ...Object.keys(after.nodes)]);

  for (const nodeId of allNodeIds) {
    pushExistingUpdate(changes, pushedUpdates, before, after, nodeId);
  }

  for (const nodeId of allNodeIds) {
    if (before.nodes[nodeId] === undefined && after.nodes[nodeId] !== undefined) {
      changes.push({ type: "insert", nodeId, after: cloneNode(after.nodes[nodeId]!) });
    } else if (before.nodes[nodeId] !== undefined && after.nodes[nodeId] === undefined) {
      changes.push({ type: "delete", nodeId, before: cloneNode(before.nodes[nodeId]!) });
    }
  }

  return changes;
}

function isDescendant(doc: JsonDoc, candidateId: NodeId, ancestorId: NodeId): boolean {
  let parentId = doc.nodes[candidateId]?.parentId ?? null;

  while (parentId !== null) {
    if (parentId === ancestorId) {
      return true;
    }

    parentId = doc.nodes[parentId]?.parentId ?? null;
  }

  return false;
}
