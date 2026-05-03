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
} from "./types.js";
import { firstJsonDifference, sameJson } from "./json-diff.js";
import {
  cloneDoc,
  cloneJson,
  deserialize,
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
import { buildPasteCandidates, type PasteCandidate } from "./json-paste.js";
import { successResult } from "./operation-result.js";
import { schemaAtPath } from "./schema-path.js";

const DEFAULT_CHILD_KEYS = ["children"];

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

      return this.commitIfValid(next, nodeId);
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
      return this.commitIfValid(next, nodeId);
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
      const validation = this.validateAtPath(parentPath, deserialize(next, parentId));

      if (!validation.ok) {
        return validation;
      }

      return this.commitIfValid(next, nodeId);
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
      const candidates = buildPasteCandidates({
        doc: this.doc,
        schema: this.schema,
        targetId,
        payload,
        mode,
        childKeys,
        clipboardSourceId: this.clipboard.sourceId,
        index: options.index,
        allocateNodeId: () => this.allocateNodeId(),
      });

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
      const candidates = buildPasteCandidates({
        doc: this.doc,
        schema: this.schema,
        targetId,
        payload,
        mode,
        childKeys,
        clipboardSourceId: this.clipboard.sourceId,
        index: options.index,
        allocateNodeId: () => this.allocateNodeId(),
      });
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
    return successResult(current, previous);
  }

  redo(): OperationResult {
    const next = this.redoStack.pop();

    if (next === undefined) {
      return { ok: false, reason: "Redo stack is empty." };
    }

    const current = cloneDoc(this.doc);

    this.undoStack.push(current);
    this.doc = next;
    return successResult(current, next);
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
          const before = cloneDoc(this.doc);

          this.commit(next);
          this.clipboard = this.clipboard === null
            ? null
            : { value: cloneJson(this.clipboard.value), sourceId: pastedRootId };
          return successResult(before, next, pastedRootId);
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

  private commitIfValid(next: JsonDoc, nodeId?: NodeId): OperationResult {
    const validation = this.validateDocument(next);

    if (!validation.ok) {
      return validation;
    }

    const before = cloneDoc(this.doc);

    this.commit(next);
    return successResult(before, next, nodeId);
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
