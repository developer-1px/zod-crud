import * as z from "zod";

import type {
  JsonCrudOptions,
  JsonDoc,
  JsonKey,
  JsonNode,
  JsonPath,
  JsonValue,
  NodeId,
  OperationResult,
  PasteOptions,
} from "./types.js";
import { firstJsonDifference, sameJson } from "./json-diff.js";
import {
  cloneDoc,
  cloneJson,
  deserialize,
  ensureObjectArrayField,
  findChildByKey,
  formatPath,
  getNode,
  getPath,
  insertChild,
  maxNodeIndex,
  removeSubtree,
  replaceSubtree,
  serialize,
} from "./json-doc.js";
import { objectArrayFieldKeys, schemaAtPath } from "./schema-path.js";

const DEFAULT_CHILD_KEYS = ["children"];

type PasteCandidate = {
  apply: () => {
    doc: JsonDoc;
    pastedRootId: NodeId;
  };
};

export function createJsonCrud<T extends JsonValue, I = unknown>(
  schema: z.ZodType<T, I>,
  initialValue: I,
  options: JsonCrudOptions = {},
): JsonCrud<T, I> {
  return new JsonCrud(schema, initialValue, options);
}

export class JsonCrud<T extends JsonValue = JsonValue, I = unknown> {
  private doc: JsonDoc;
  private readonly schema: z.ZodType<T, I>;
  private readonly childKeys: string[];
  private undoStack: JsonDoc[] = [];
  private redoStack: JsonDoc[] = [];
  private clipboard: { value: JsonValue; sourceId: NodeId | null } | null = null;
  private nextNodeIndex: number;

  constructor(schema: z.ZodType<T, I>, initialValue: I, options: JsonCrudOptions = {}) {
    const parsed = schema.safeParse(initialValue);

    if (!parsed.success) {
      throw parsed.error;
    }

    this.schema = schema;
    this.doc = serialize(parsed.data);
    this.childKeys = options.childKeys ?? DEFAULT_CHILD_KEYS;
    this.nextNodeIndex = maxNodeIndex(this.doc) + 1;

    const validation = this.validateDocument(this.doc);

    if (!validation.ok) {
      throw new Error(validation.reason);
    }
  }

  snapshot(): JsonDoc {
    return cloneDoc(this.doc);
  }

  toJson(): T {
    return this.schema.parse(deserialize(this.doc));
  }

  read(nodeId: NodeId = this.doc.rootId): JsonValue {
    return cloneJson(deserialize(this.doc, nodeId));
  }

  pathOf(nodeId: NodeId): JsonPath {
    return getPath(this.doc, nodeId);
  }

  find(parentId: NodeId, key: JsonKey): NodeId | null {
    const child = findChildByKey(this.doc, parentId, key);
    return child?.id ?? null;
  }

  create(parentId: NodeId, key: string | number, value: JsonValue): OperationResult {
    try {
      const next = cloneDoc(this.doc);
      const parentPath = getPath(next, parentId);

      const nodeId = insertChild(next, parentId, key, value, () => this.allocateNodeId());
      const validation = this.validateAtPath(parentPath, deserialize(next, parentId));

      if (!validation.ok) {
        return validation;
      }

      return this.commitIfValid(next, nodeId, nodeId);
    } catch (error) {
      return failure(error);
    }
  }

  update(nodeId: NodeId, value: JsonValue): OperationResult {
    try {
      const path = getPath(this.doc, nodeId);
      const validation = this.validateAtPath(path, value);

      if (!validation.ok) {
        return validation;
      }

      const next = cloneDoc(this.doc);

      replaceSubtree(next, nodeId, value, () => this.allocateNodeId());
      return this.commitIfValid(next, nodeId, nodeId);
    } catch (error) {
      return failure(error);
    }
  }

  delete(nodeId: NodeId): OperationResult {
    if (nodeId === this.doc.rootId) {
      return { ok: false, reason: "Cannot delete the root node." };
    }

    try {
      const node = getNode(this.doc, nodeId);
      const parentId = node.parentId;

      if (parentId === null) {
        return { ok: false, reason: "Cannot delete a node without a parent." };
      }

      const parentPath = getPath(this.doc, parentId);
      const next = cloneDoc(this.doc);

      removeSubtree(next, nodeId);
      const focusNodeId = focusAfterRemoval(this.doc, next, nodeId);
      const validation = this.validateAtPath(parentPath, deserialize(next, parentId));

      if (!validation.ok) {
        return validation;
      }

      return this.commitIfValid(next, nodeId, focusNodeId);
    } catch (error) {
      return failure(error);
    }
  }

  copy(nodeId: NodeId): JsonValue {
    const value = this.read(nodeId);
    this.clipboard = { value, sourceId: nodeId };
    return cloneJson(value);
  }

  cut(nodeId: NodeId): OperationResult {
    if (nodeId === this.doc.rootId) {
      return { ok: false, reason: "Cannot cut the root node." };
    }

    try {
      const value = this.read(nodeId);
      const result = this.delete(nodeId);

      if (result.ok) {
        this.clipboard = { value, sourceId: null };
      }

      return result;
    } catch (error) {
      return failure(error);
    }
  }

  paste(targetId: NodeId, options: PasteOptions = {}): OperationResult {
    try {
      if (this.clipboard === null) {
        return { ok: false, reason: "Clipboard is empty." };
      }

      const payload = cloneJson(this.clipboard.value);
      const mode = options.mode ?? "auto";
      const childKeys = options.childKeys ?? this.childKeys;
      const candidates = this.buildPasteCandidates(targetId, payload, mode, childKeys, options.index);

      return this.commitFirstValidPaste(candidates);
    } catch (error) {
      return failure(error);
    }
  }

  canPaste(targetId: NodeId, options: PasteOptions = {}): OperationResult {
    if (this.clipboard === null) {
      return { ok: false, reason: "Clipboard is empty." };
    }

    const nextNodeIndex = this.nextNodeIndex;

    try {
      const payload = cloneJson(this.clipboard.value);
      const mode = options.mode ?? "auto";
      const childKeys = options.childKeys ?? this.childKeys;
      const candidates = this.buildPasteCandidates(targetId, payload, mode, childKeys, options.index);
      const result = this.firstValidPasteResult(candidates);

      return result.ok ? { ok: true } : result;
    } catch (error) {
      return failure(error);
    } finally {
      this.nextNodeIndex = nextNodeIndex;
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): OperationResult {
    const previous = this.undoStack.pop();

    if (previous === undefined) {
      return { ok: false, reason: "Undo stack is empty." };
    }

    const current = cloneDoc(this.doc);

    this.redoStack.push(current);
    this.doc = previous;
    return { ok: true, focusNodeId: focusFromDiff(current, previous) };
  }

  redo(): OperationResult {
    const next = this.redoStack.pop();

    if (next === undefined) {
      return { ok: false, reason: "Redo stack is empty." };
    }

    const current = cloneDoc(this.doc);

    this.undoStack.push(current);
    this.doc = next;
    return { ok: true, focusNodeId: focusFromDiff(current, next) };
  }

  private buildPasteCandidates(
    targetId: NodeId,
    payload: JsonValue,
    mode: PasteOptions["mode"],
    childKeys: string[],
    index?: number,
  ): PasteCandidate[] {
    getNode(this.doc, targetId);

    if (mode === "overwrite") {
      return [this.overwritePasteCandidate(targetId, payload)];
    }

    if (mode === "child") {
      return this.childPasteCandidates(targetId, payload, childKeys, index);
    }

    const selfSiblingCandidates = this.selfSiblingPasteCandidates(targetId, payload, index);
    const childCandidates = this.childPasteCandidates(targetId, payload, childKeys, index);

    if (selfSiblingCandidates.length > 0) {
      return [...selfSiblingCandidates, ...childCandidates];
    }

    return [
      ...childCandidates,
      this.overwritePasteCandidate(targetId, payload),
    ];
  }

  private commitFirstValidPaste(candidates: PasteCandidate[]): OperationResult {
    let lastFailure: OperationResult | null = null;
    const initialNodeIndex = this.nextNodeIndex;

    for (const candidate of candidates) {
      const candidateNodeIndex = this.nextNodeIndex;

      try {
        const { doc: next, pastedRootId } = candidate.apply();
        const validation = this.validateDocument(next);

        if (validation.ok) {
          this.commit(next);
          this.clipboard = this.clipboard === null
            ? null
            : { value: cloneJson(this.clipboard.value), sourceId: pastedRootId };
          return { ok: true, nodeId: pastedRootId, focusNodeId: pastedRootId };
        }

        lastFailure = validation;
      } catch (error) {
        lastFailure = failure(error);
      }

      this.nextNodeIndex = candidateNodeIndex;
    }

    this.nextNodeIndex = initialNodeIndex;
    return lastFailure ?? { ok: false, reason: "No paste candidate accepted the clipboard payload." };
  }

  private firstValidPasteResult(candidates: PasteCandidate[]): OperationResult {
    let lastFailure: OperationResult | null = null;
    const initialNodeIndex = this.nextNodeIndex;

    for (const candidate of candidates) {
      const candidateNodeIndex = this.nextNodeIndex;

      try {
        const validation = this.validateDocument(candidate.apply().doc);

        if (validation.ok) {
          this.nextNodeIndex = initialNodeIndex;
          return { ok: true };
        }

        lastFailure = validation;
      } catch (error) {
        lastFailure = failure(error);
      }

      this.nextNodeIndex = candidateNodeIndex;
    }

    this.nextNodeIndex = initialNodeIndex;
    return lastFailure ?? { ok: false, reason: "No paste candidate accepted the clipboard payload." };
  }

  private overwritePasteCandidate(targetId: NodeId, payload: JsonValue): PasteCandidate {
    return {
      apply: () => {
        const next = cloneDoc(this.doc);

        replaceSubtree(next, targetId, payload, () => this.allocateNodeId());
        return { doc: next, pastedRootId: targetId };
      },
    };
  }

  private selfSiblingPasteCandidates(
    targetId: NodeId,
    payload: JsonValue,
    index?: number,
  ): PasteCandidate[] {
    if (this.clipboard?.sourceId !== targetId) {
      return [];
    }

    const target = getNode(this.doc, targetId);

    if (target.parentId === null) {
      return [];
    }

    const parent = getNode(this.doc, target.parentId);

    if (parent.type !== "array") {
      return [];
    }

    const targetIndex = parent.children.indexOf(targetId);

    if (targetIndex === -1) {
      return [];
    }

    return [this.arrayInsertPasteCandidate(parent.id, payload, index ?? targetIndex + 1)];
  }

  private childPasteCandidates(
    targetId: NodeId,
    payload: JsonValue,
    childKeys: string[],
    index?: number,
  ): PasteCandidate[] {
    const target = getNode(this.doc, targetId);

    if (target.type === "array") {
      return [this.arrayInsertPasteCandidate(targetId, payload, index)];
    }

    if (target.type !== "object") {
      return [];
    }

    return this.objectChildArrayKeys(targetId, childKeys).map((childKey) =>
      this.objectChildArrayPasteCandidate(targetId, childKey, payload, index),
    );
  }

  private objectChildArrayPasteCandidate(
    targetId: NodeId,
    childKey: string,
    payload: JsonValue,
    index?: number,
  ): PasteCandidate {
    return {
      apply: () => {
        const next = cloneDoc(this.doc);
        const childArrayId = ensureObjectArrayField(next, targetId, childKey, () => this.allocateNodeId());

        const pastedRootId = insertChild(
          next,
          childArrayId,
          index ?? getNode(next, childArrayId).children.length,
          payload,
          () => this.allocateNodeId(),
        );
        return { doc: next, pastedRootId };
      },
    };
  }

  private arrayInsertPasteCandidate(
    arrayId: NodeId,
    payload: JsonValue,
    index?: number,
  ): PasteCandidate {
    return {
      apply: () => {
        const next = cloneDoc(this.doc);

        const pastedRootId = insertChild(
          next,
          arrayId,
          index ?? getNode(next, arrayId).children.length,
          payload,
          () => this.allocateNodeId(),
        );
        return { doc: next, pastedRootId };
      },
    };
  }

  private objectChildArrayKeys(targetId: NodeId, childKeys: string[]): string[] {
    const target = getNode(this.doc, targetId);
    const keys = new Set<string>();
    const targetSchema = schemaAtPath(this.schema, getPath(this.doc, targetId));

    if (targetSchema !== null) {
      for (const childKey of objectArrayFieldKeys(targetSchema)) {
        keys.add(childKey);
      }
    }

    for (const childId of target.children) {
      const child = getNode(this.doc, childId);

      if (child.type === "array" && typeof child.key === "string") {
        keys.add(child.key);
      }
    }

    for (const childKey of childKeys) {
      keys.add(childKey);
    }

    return [...keys];
  }

  private validateAtPath(path: JsonPath, value: JsonValue): OperationResult {
    const targetSchema = schemaAtPath(this.schema, path);

    if (targetSchema === null) {
      return {
        ok: false,
        reason: `No schema found for path ${formatPath(path)}.`,
      };
    }

    const result = targetSchema.safeParse(value);

    if (!result.success) {
      return {
        ok: false,
        reason: `Value does not match schema at ${formatPath(path)}.`,
        error: result.error,
      };
    }

    return { ok: true };
  }

  private validateDocument(doc: JsonDoc): OperationResult {
    const value = deserialize(doc);
    const result = this.schema.safeParse(value);

    if (!result.success) {
      return {
        ok: false,
        reason: "Document does not match the root schema.",
        error: result.error,
      };
    }

    if (!sameJson(result.data, value)) {
      const difference = firstJsonDifference(result.data, value);

      return {
        ok: false,
        reason: difference === null
          ? "Document does not match the root schema exactly."
          : `Document does not match the root schema exactly: ${difference}.`,
      };
    }

    return { ok: true };
  }

  private commitIfValid(next: JsonDoc, nodeId?: NodeId, focusNodeId?: NodeId): OperationResult {
    const validation = this.validateDocument(next);

    if (!validation.ok) {
      return validation;
    }

    this.commit(next);
    return {
      ok: true,
      ...(nodeId === undefined ? {} : { nodeId }),
      ...(focusNodeId === undefined ? {} : { focusNodeId }),
    };
  }

  private commit(next: JsonDoc): void {
    this.undoStack.push(cloneDoc(this.doc));
    this.doc = next;
    this.redoStack = [];
  }

  private allocateNodeId(): NodeId {
    let id = `n${this.nextNodeIndex}`;
    this.nextNodeIndex += 1;

    while (this.doc.nodes[id] !== undefined) {
      id = `n${this.nextNodeIndex}`;
      this.nextNodeIndex += 1;
    }

    return id;
  }
}

function failure(error: unknown): OperationResult {
  return {
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  };
}

function focusFromDiff(before: JsonDoc, after: JsonDoc): NodeId {
  const insertedRoot = Object.values(after.nodes)
    .filter((node) => before.nodes[node.id] === undefined)
    .find((node) => node.parentId !== null && before.nodes[node.parentId] !== undefined);

  if (insertedRoot !== undefined) {
    return insertedRoot.id;
  }

  const changedExisting = Object.values(after.nodes).find((node) => {
    const previous = before.nodes[node.id];

    return previous !== undefined && !sameNode(previous, node);
  });

  if (changedExisting !== undefined) {
    return changedExisting.id;
  }

  const removedRoot = Object.values(before.nodes)
    .filter((node) => after.nodes[node.id] === undefined)
    .find((node) => node.parentId !== null && after.nodes[node.parentId] !== undefined);

  if (removedRoot !== undefined) {
    return focusAfterRemoval(before, after, removedRoot.id);
  }

  return after.rootId;
}

function focusAfterRemoval(before: JsonDoc, after: JsonDoc, removedId: NodeId): NodeId {
  const oldNode = before.nodes[removedId];

  if (oldNode === undefined) {
    return after.rootId;
  }

  const siblings = oldNode.parentId === null ? [] : before.nodes[oldNode.parentId]?.children ?? [];
  const oldIndex = siblings.indexOf(removedId);
  const candidates = [
    siblings[oldIndex + 1],
    siblings[oldIndex - 1],
    oldNode.parentId,
  ].filter((id): id is NodeId => id !== undefined);

  for (const candidate of candidates) {
    if (after.nodes[candidate] !== undefined) {
      return candidate;
    }

    const parent = nearestExistingParent(before, after, candidate);

    if (parent !== null) {
      return parent;
    }
  }

  return after.rootId;
}

function nearestExistingParent(before: JsonDoc, after: JsonDoc, nodeId: NodeId): NodeId | null {
  let current = before.nodes[nodeId];

  while (current !== undefined) {
    if (after.nodes[current.id] !== undefined) {
      return current.id;
    }

    current = current.parentId === null ? undefined : before.nodes[current.parentId];
  }

  return null;
}

function sameNode(left: JsonNode, right: JsonNode): boolean {
  return left.type === right.type &&
    left.parentId === right.parentId &&
    left.key === right.key &&
    left.value === right.value &&
    left.children.length === right.children.length &&
    left.children.every((childId, index) => childId === right.children[index]);
}
