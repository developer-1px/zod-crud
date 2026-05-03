import * as z from "zod";

import type {
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
  getNode,
  getPath,
  insertChild,
  maxNodeIndex,
  removeSubtree,
  replaceSubtree,
  serialize,
} from "../document/json-doc.js";
import { buildPasteCandidates, type PasteCandidate } from "./json-paste.js";
import { validateAtPath, validateDocument } from "../schema/json-validation.js";
import { successResult } from "./operation-result.js";

const DEFAULT_CHILD_KEYS = ["children"];

export type JsonCrud<T extends JsonValue = JsonValue, I = unknown> = {
  snapshot: () => JsonDoc;
  toJson: () => T;
  read: (nodeId?: NodeId) => JsonValue;
  pathOf: (nodeId: NodeId) => JsonPath;
  find: (parentId: NodeId, key: JsonKey) => NodeId | null;
  create: (parentId: NodeId, key: string | number, value: JsonValue) => OperationResult;
  update: (nodeId: NodeId, value: JsonValue) => OperationResult;
  delete: (nodeId: NodeId) => OperationResult;
  copy: (nodeId: NodeId) => JsonValue;
  cut: (nodeId: NodeId) => OperationResult;
  paste: (targetId: NodeId, options?: PasteOptions) => OperationResult;
  canPaste: (targetId: NodeId, options?: PasteOptions) => OperationResult;
  canUndo: () => boolean;
  canRedo: () => boolean;
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
  let undoStack: JsonDoc[] = [];
  let redoStack: JsonDoc[] = [];
  let clipboard: { value: JsonValue; sourceId: NodeId | null } | null = null;
  let nextNodeIndex = maxNodeIndex(doc) + 1;

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

  function create(parentId: NodeId, key: string | number, value: JsonValue): OperationResult {
    try {
      const next = cloneDoc(doc);
      const parentPath = getPath(next, parentId);

      const nodeId = insertChild(next, parentId, key, value, allocateNodeId);
      const validation = validateAtPath(schema, parentPath, deserialize(next, parentId));

      if (!validation.ok) {
        return validation;
      }

      return commitIfValid(next, nodeId);
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
      return commitIfValid(next, nodeId);
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

      return commitIfValid(next, nodeId);
    } catch (error) {
      return failure(error);
    }
  }

  function copy(nodeId: NodeId): JsonValue {
    const value = read(nodeId);
    clipboard = { value, sourceId: nodeId };
    return cloneJson(value);
  }

  function cut(nodeId: NodeId): OperationResult {
    if (nodeId === doc.rootId) {
      return { ok: false, reason: "Cannot cut the root node." };
    }

    try {
      const value = read(nodeId);
      const result = deleteNode(nodeId);

      if (result.ok) {
        clipboard = { value, sourceId: null };
      }

      return result;
    } catch (error) {
      return failure(error);
    }
  }

  function paste(targetId: NodeId, options: PasteOptions = {}): OperationResult {
    try {
      if (clipboard === null) {
        return { ok: false, reason: "Clipboard is empty." };
      }

      const candidates = pasteCandidates(targetId, cloneJson(clipboard.value), options);
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
      const candidates = pasteCandidates(targetId, cloneJson(clipboard.value), options);
      const result = firstValidPasteResult(candidates);

      return result.ok ? { ok: true } : result;
    } catch (error) {
      return failure(error);
    } finally {
      nextNodeIndex = initialNodeIndex;
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

    redoStack.push(current);
    doc = previous;
    return successResult(current, previous);
  }

  function redo(): OperationResult {
    const next = redoStack.pop();

    if (next === undefined) {
      return { ok: false, reason: "Redo stack is empty." };
    }

    const current = cloneDoc(doc);

    undoStack.push(current);
    doc = next;
    return successResult(current, next);
  }

  function pasteCandidates(
    targetId: NodeId,
    payload: JsonValue,
    pasteOptions: PasteOptions,
  ): PasteCandidate[] {
    return buildPasteCandidates({
      doc,
      schema,
      targetId,
      payload,
      mode: pasteOptions.mode ?? "auto",
      childKeys: pasteOptions.childKeys ?? childKeys,
      clipboardSourceId: clipboard?.sourceId ?? null,
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
        const { doc: next, pastedRootId } = candidate.apply();
        const validation = validateDocument(schema, next);

        if (validation.ok) {
          const before = cloneDoc(doc);

          commit(next);
          clipboard = clipboard === null
            ? null
            : { value: cloneJson(clipboard.value), sourceId: pastedRootId };
          return successResult(before, next, pastedRootId);
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

  function commitIfValid(next: JsonDoc, nodeId?: NodeId): OperationResult {
    const validation = validateDocument(schema, next);

    if (!validation.ok) {
      return validation;
    }

    const before = cloneDoc(doc);

    commit(next);
    return successResult(before, next, nodeId);
  }

  function commit(next: JsonDoc): void {
    undoStack.push(cloneDoc(doc));
    doc = next;
    redoStack = [];
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

  return {
    snapshot,
    toJson,
    read,
    pathOf,
    find,
    create,
    update,
    delete: deleteNode,
    copy,
    cut,
    paste,
    canPaste,
    canUndo,
    canRedo,
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
