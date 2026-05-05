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
import { buildPasteCandidates, buildPasteManyCandidates, type PasteCandidate } from "./json-paste.js";
import { validateAtPath, validateDocument } from "../schema/json-validation.js";
import { objectArrayFieldKeys, schemaAtPath } from "../schema/schema-path.js";
import {
  changesForDeletedSubtree,
  changesForDeletedSubtrees,
  changesForInsertedSubtree,
  changesForInsertedSubtrees,
  changesForReplacedSubtree,
  invertChanges,
  successResult,
} from "./operation-result.js";

const DEFAULT_CHILD_KEYS = ["children"];

type HistoryEntry = {
  doc: JsonDoc;
  changes: JsonChange[];
  nodeId?: NodeId;
  focusNodeId?: NodeId;
  focusNodeIds?: NodeId[];
};

type Clipboard = {
  values: JsonValue[];
  sourceIds: NodeId[] | null;
};

type OperationFailure = Extract<OperationResult, { ok: false }>;

type DeleteManyPlan = {
  ok: true;
  next: JsonDoc;
  changes: JsonChange[];
  focusNodeId: NodeId;
  nodeId?: NodeId;
};

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
  let undoStack: HistoryEntry[] = [];
  let redoStack: HistoryEntry[] = [];
  let clipboard: Clipboard | null = null;
  let nextNodeIndex = maxNodeIndex(doc) + 1;
  const listeners = new Set<() => void>();

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
      const plan = planDeleteMany(nodeIds);

      if (!plan.ok) {
        return plan;
      }

      return commitIfValid(plan.next, plan.changes, plan.nodeId, plan.focusNodeId);
    } catch (error) {
      return failure(error);
    }
  }

  function copy(nodeId: NodeId): JsonValue {
    const value = read(nodeId);
    clipboard = { values: [value], sourceIds: [nodeId] };
    return cloneJson(value);
  }

  function copyMany(nodeIds: NodeId[]): JsonValue[] {
    const nodes = uniqueNodes(doc, nodeIds);

    if (nodes.length === 0) {
      throw new Error("No nodes to copy.");
    }

    const values = nodes.map((node) => read(node.id));

    clipboard = { values, sourceIds: nodes.map((node) => node.id) };
    return cloneJson(values);
  }

  function canCopyMany(nodeIds: NodeId[]): OperationResult {
    try {
      const nodes = uniqueNodes(doc, nodeIds);

      return nodes.length === 0 ? { ok: false, reason: "No nodes to copy." } : { ok: true };
    } catch (error) {
      return failure(error);
    }
  }

  function cut(nodeId: NodeId): OperationResult {
    if (nodeId === doc.rootId) {
      return { ok: false, reason: "Cannot cut the root node." };
    }

    try {
      const value = read(nodeId);
      const result = deleteNode(nodeId);

      if (result.ok) {
        clipboard = { values: [value], sourceIds: null };
      }

      return result;
    } catch (error) {
      return failure(error);
    }
  }

  function cutMany(nodeIds: NodeId[]): OperationResult {
    try {
      const nodes = uniqueNodes(doc, nodeIds);
      const values = nodes.map((node) => read(node.id));
      const result = deleteMany(nodes.map((node) => node.id));

      if (result.ok) {
        clipboard = { values, sourceIds: null };
      }

      return result;
    } catch (error) {
      return failure(error);
    }
  }

  function canCutMany(nodeIds: NodeId[]): OperationResult {
    return canDeleteMany(nodeIds);
  }

  function paste(targetId: NodeId, options: PasteOptions = {}): OperationResult {
    try {
      if (clipboard === null) {
        return { ok: false, reason: "Clipboard is empty." };
      }

      const candidates = pasteCandidates(targetId, cloneJson(clipboard.values), options);
      return commitFirstValidPaste(candidates);
    } catch (error) {
      return failure(error);
    }
  }

  function canPaste(targetId: NodeId, options: PasteOptions = {}): OperationResult {
    if (clipboard === null) {
      return { ok: false, reason: "Clipboard is empty." };
    }

    const initialNodeIndex = nextNodeIndex;

    try {
      const candidates = pasteCandidates(targetId, cloneJson(clipboard.values), options);
      const result = firstValidPasteResult(candidates);

      return result.ok ? { ok: true } : result;
    } catch (error) {
      return failure(error);
    } finally {
      nextNodeIndex = initialNodeIndex;
    }
  }

  function canDeleteMany(nodeIds: NodeId[]): OperationResult {
    try {
      const plan = planDeleteMany(nodeIds);

      if (!plan.ok) {
        return plan;
      }

      const validation = validateDocument(schema, plan.next);

      return validation.ok ? { ok: true } : validation;
    } catch (error) {
      return failure(error);
    }
  }

  function canUndo(): boolean {
    return undoStack.length > 0;
  }

  function canRedo(): boolean {
    return redoStack.length > 0;
  }

  function undo(): OperationResult {
    const previous = undoStack.pop();

    if (previous === undefined) {
      return { ok: false, reason: "Undo stack is empty." };
    }

    const current = cloneDoc(doc);

    redoStack.push({
      doc: current,
      changes: previous.changes,
      ...(previous.nodeId === undefined ? {} : { nodeId: previous.nodeId }),
      ...(previous.focusNodeId === undefined ? {} : { focusNodeId: previous.focusNodeId }),
      ...(previous.focusNodeIds === undefined ? {} : { focusNodeIds: previous.focusNodeIds }),
    });
    doc = previous.doc;
    notifyListeners();
    return successResult(current, previous.doc, invertChanges(previous.changes), previous.nodeId, undefined, undefined, options.focusFilter);
  }

  function redo(): OperationResult {
    const next = redoStack.pop();

    if (next === undefined) {
      return { ok: false, reason: "Redo stack is empty." };
    }

    const current = cloneDoc(doc);

    undoStack.push({
      doc: current,
      changes: next.changes,
      ...(next.nodeId === undefined ? {} : { nodeId: next.nodeId }),
      ...(next.focusNodeId === undefined ? {} : { focusNodeId: next.focusNodeId }),
      ...(next.focusNodeIds === undefined ? {} : { focusNodeIds: next.focusNodeIds }),
    });
    doc = next.doc;
    notifyListeners();
    return successResult(current, next.doc, next.changes, next.nodeId, next.focusNodeId, next.focusNodeIds, options.focusFilter);
  }

  function pasteCandidates(
    targetId: NodeId,
    payloads: JsonValue[],
    pasteOptions: PasteOptions,
  ): PasteCandidate[] {
    if (payloads.length !== 1) {
      return buildPasteManyCandidates({
        doc,
        schema,
        targetId,
        payloads,
        mode: pasteOptions.mode ?? "auto",
        childKeys: pasteOptions.childKeys ?? childKeys,
        index: pasteOptions.index,
        allocateNodeId,
      });
    }

    return buildPasteCandidates({
      doc,
      schema,
      targetId,
      payload: payloads[0]!,
      mode: pasteOptions.mode ?? "auto",
      childKeys: pasteOptions.childKeys ?? childKeys,
      clipboardSourceId: clipboard?.sourceIds?.[0] ?? null,
      index: pasteOptions.index,
      allocateNodeId,
    });
  }

  function commitFirstValidPaste(candidates: PasteCandidate[]): OperationResult {
    let lastFailure: OperationResult | null = null;
    const initialNodeIndex = nextNodeIndex;

    for (const candidate of candidates) {
      const candidateNodeIndex = nextNodeIndex;

      try {
        const { doc: next, pastedRootId, pastedRootIds } = candidate.apply();
        const validation = validateDocument(schema, next);

        if (validation.ok) {
          const before = cloneDoc(doc);
          const changes = pastedRootIds.some((nodeId) => before.nodes[nodeId] === undefined)
            ? changesForInsertedSubtrees(before, next, pastedRootIds)
            : changesForReplacedSubtree(before, next, pastedRootId);

          const focusNodeIds = pastedRootIds.length > 1 ? pastedRootIds : undefined;
          const focusNodeId = pastedRootIds[pastedRootIds.length - 1] ?? pastedRootId;

          commit(next, changes, pastedRootId, focusNodeId, focusNodeIds);
          clipboard = clipboard === null
            ? null
            : { values: cloneJson(clipboard.values), sourceIds: pastedRootIds };
          return successResult(before, next, changes, pastedRootId, focusNodeId, focusNodeIds, options.focusFilter);
        }

        lastFailure = validation;
      } catch (error) {
        lastFailure = failure(error);
      }

      nextNodeIndex = candidateNodeIndex;
    }

    nextNodeIndex = initialNodeIndex;
    return lastFailure ?? { ok: false, reason: "No paste candidate accepted the clipboard payload." };
  }

  function firstValidPasteResult(candidates: PasteCandidate[]): OperationResult {
    let lastFailure: OperationResult | null = null;
    const initialNodeIndex = nextNodeIndex;

    for (const candidate of candidates) {
      const candidateNodeIndex = nextNodeIndex;

      try {
        const validation = validateDocument(schema, candidate.apply().doc);

        if (validation.ok) {
          nextNodeIndex = initialNodeIndex;
          return { ok: true };
        }

        lastFailure = validation;
      } catch (error) {
        lastFailure = failure(error);
      }

      nextNodeIndex = candidateNodeIndex;
    }

    nextNodeIndex = initialNodeIndex;
    return lastFailure ?? { ok: false, reason: "No paste candidate accepted the clipboard payload." };
  }

  function planDeleteMany(nodeIds: NodeId[]): DeleteManyPlan | OperationFailure {
    const nodes = uniqueNodes(doc, nodeIds);

    if (nodes.length === 0) {
      return { ok: false, reason: "No nodes to delete." };
    }

    if (nodes.some((node) => node.id === doc.rootId || node.parentId === null)) {
      return { ok: false, reason: "Cannot delete the root node." };
    }

    const parentId = nodes[0]?.parentId;

    if (parentId === null || parentId === undefined) {
      return { ok: false, reason: "Cannot delete a node without a parent." };
    }

    if (nodes.some((node) => node.parentId !== parentId)) {
      return { ok: false, reason: "deleteMany only accepts sibling nodes." };
    }

    const parentPath = getPath(doc, parentId);
    const next = cloneDoc(doc);
    const sortedNodes = sortBySiblingIndexDescending(doc, parentId, nodes);

    for (const node of sortedNodes) {
      removeSubtree(next, node.id);
    }

    const validation = validateAtPath(schema, parentPath, deserialize(next, parentId));

    if (!validation.ok) {
      return validation;
    }

    const changes = changesForDeletedSubtrees(doc, next, sortedNodes.map((node) => node.id));
    const focusNodeId = focusAfterSiblingBatchRemoval(
      doc,
      next,
      parentId,
      sortedNodes.map((node) => node.id),
      options.focusFilter,
    );
    const nodeId = sortedNodes[0]?.id;

    return {
      ok: true,
      next,
      changes,
      focusNodeId,
      ...(nodeId === undefined ? {} : { nodeId }),
    };
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

  function commit(
    next: JsonDoc,
    changes: JsonChange[],
    nodeId?: NodeId,
    focusNodeId?: NodeId,
    focusNodeIds?: NodeId[],
  ): void {
    undoStack.push({
      doc: cloneDoc(doc),
      changes,
      ...(nodeId === undefined ? {} : { nodeId }),
      ...(focusNodeId === undefined ? {} : { focusNodeId }),
      ...(focusNodeIds === undefined ? {} : { focusNodeIds }),
    });
    doc = next;
    redoStack = [];
    notifyListeners();
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

function uniqueNodes(doc: JsonDoc, nodeIds: NodeId[]): JsonNode[] {
  const seen = new Set<NodeId>();
  const nodes: JsonNode[] = [];

  for (const nodeId of nodeIds) {
    if (seen.has(nodeId)) {
      continue;
    }

    seen.add(nodeId);
    nodes.push(getNode(doc, nodeId));
  }

  return nodes;
}

function sortBySiblingIndexDescending(doc: JsonDoc, parentId: NodeId, nodes: JsonNode[]): JsonNode[] {
  const parent = getNode(doc, parentId);
  const siblingIndex = new Map(parent.children.map((childId, index) => [childId, index]));

  return [...nodes].sort((left, right) =>
    (siblingIndex.get(right.id) ?? -1) - (siblingIndex.get(left.id) ?? -1),
  );
}

function focusAfterSiblingBatchRemoval(
  before: JsonDoc,
  after: JsonDoc,
  parentId: NodeId,
  deletedNodeIds: NodeId[],
  focusFilter?: (doc: JsonDoc, candidateId: NodeId) => boolean,
): NodeId {
  const parent = before.nodes[parentId];
  const deleted = new Set(deletedNodeIds);
  const deletedIndexes = parent?.children
    .map((childId, index) => deleted.has(childId) ? index : -1)
    .filter((index) => index >= 0) ?? [];

  if (deletedIndexes.length === 0) {
    return after.nodes[parentId] === undefined ? after.rootId : parentId;
  }

  const minIndex = Math.min(...deletedIndexes);
  const maxIndex = Math.max(...deletedIndexes);
  const nextId = parent?.children.slice(maxIndex + 1).find((childId) => !deleted.has(childId));
  const previousId = parent?.children.slice(0, minIndex).reverse().find((childId) => !deleted.has(childId));
  const candidates = [nextId, previousId, parentId, after.rootId];

  return candidates.find((id): id is NodeId =>
    id !== undefined &&
    after.nodes[id] !== undefined &&
    (focusFilter?.(after, id) ?? true)
  ) ?? after.rootId;
}
