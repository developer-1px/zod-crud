import * as z from "zod";

import type {
  JsonCrudOptions,
  JsonDoc,
  JsonKey,
  JsonNode,
  JsonPath,
  JsonPrimitive,
  JsonValue,
  NodeId,
  OperationResult,
  PasteOptions,
} from "./types.js";

type AnySchema = z.ZodType<unknown>;

const DEFAULT_CHILD_KEYS = ["children"];

type PasteCandidate = {
  apply: () => JsonDoc;
};

export function serialize(value: JsonValue): JsonDoc {
  const doc: JsonDoc = { rootId: "n1", nodes: {} };
  doc.rootId = createSubtree(doc, value, null, null, "n1");
  return doc;
}

export function deserialize(doc: JsonDoc, nodeId: NodeId = doc.rootId): JsonValue {
  const node = getNode(doc, nodeId);

  if (node.type === "object") {
    const object: Record<string, JsonValue> = {};

    for (const childId of node.children) {
      const child = getNode(doc, childId);

      if (typeof child.key !== "string") {
        throw new Error(`Object child ${child.id} has non-string key.`);
      }

      if (hasOwn(object, child.key)) {
        throw new Error(`Object node ${node.id} has duplicate key: ${child.key}.`);
      }

      Object.defineProperty(object, child.key, {
        configurable: true,
        enumerable: true,
        value: deserialize(doc, child.id),
        writable: true,
      });
    }

    return object;
  }

  if (node.type === "array") {
    return node.children.map((childId) => deserialize(doc, childId));
  }

  return node.value ?? null;
}

export function getPath(doc: JsonDoc, nodeId: NodeId): JsonPath {
  const path: JsonPath = [];
  let current = getNode(doc, nodeId);

  while (current.parentId !== null) {
    if (current.key === null) {
      throw new Error(`Non-root node ${current.id} is missing a key.`);
    }

    path.push(current.key);
    current = getNode(doc, current.parentId);
  }

  return path.reverse();
}

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

      insertChild(next, parentId, key, value, () => this.allocateNodeId());
      const validation = this.validateAtPath(parentPath, deserialize(next, parentId));

      if (!validation.ok) {
        return validation;
      }

      return this.commitIfValid(next);
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
      return this.commitIfValid(next);
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

      return this.commitIfValid(next);
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

    const before = cloneDoc(this.doc);
    const undo = this.undoStack.map(cloneDoc);
    const redo = this.redoStack.map(cloneDoc);
    const nextNodeIndex = this.nextNodeIndex;
    try {
      const result = this.paste(targetId, options);
      return result.ok ? { ok: true } : result;
    } finally {
      this.doc = before;
      this.undoStack = undo;
      this.redoStack = redo;
      this.nextNodeIndex = nextNodeIndex;
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): boolean {
    const previous = this.undoStack.pop();

    if (previous === undefined) {
      return false;
    }

    this.redoStack.push(cloneDoc(this.doc));
    this.doc = previous;
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();

    if (next === undefined) {
      return false;
    }

    this.undoStack.push(cloneDoc(this.doc));
    this.doc = next;
    return true;
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
        const next = candidate.apply();
        const validation = this.validateDocument(next);

        if (validation.ok) {
          this.commit(next);
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
        return next;
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

        insertChild(
          next,
          childArrayId,
          index ?? getNode(next, childArrayId).children.length,
          payload,
          () => this.allocateNodeId(),
        );
        return next;
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

        insertChild(
          next,
          arrayId,
          index ?? getNode(next, arrayId).children.length,
          payload,
          () => this.allocateNodeId(),
        );
        return next;
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

  private commitIfValid(next: JsonDoc): OperationResult {
    const validation = this.validateDocument(next);

    if (!validation.ok) {
      return validation;
    }

    this.commit(next);
    return { ok: true };
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

function createSubtree(
  doc: JsonDoc,
  value: JsonValue,
  parentId: NodeId | null,
  key: JsonKey,
  forcedId?: NodeId,
  allocateNodeId?: () => NodeId,
): NodeId {
  const id = forcedId ?? allocateNodeId?.() ?? nextNodeId(doc);
  const node = createNode(id, value, parentId, key);
  doc.nodes[id] = node;

  if (Array.isArray(value)) {
    value.forEach((childValue, index) => {
      node.children.push(createSubtree(doc, childValue, id, index, undefined, allocateNodeId));
    });
    return id;
  }

  if (isJsonObject(value)) {
    for (const [childKey, childValue] of Object.entries(value)) {
      node.children.push(createSubtree(doc, childValue, id, childKey, undefined, allocateNodeId));
    }
  }

  return id;
}

function createNode(
  id: NodeId,
  value: JsonValue,
  parentId: NodeId | null,
  key: JsonKey,
): JsonNode {
  if (Array.isArray(value)) {
    return { id, type: "array", parentId, key, children: [] };
  }

  if (isJsonObject(value)) {
    return { id, type: "object", parentId, key, children: [] };
  }

  if (value === null) {
    return { id, type: "null", parentId, key, children: [], value: null };
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("JSON numbers must be finite.");
  }

  if (typeof value === "string") {
    return { id, type: "string", parentId, key, children: [], value };
  }

  if (typeof value === "number") {
    return { id, type: "number", parentId, key, children: [], value };
  }

  if (typeof value === "boolean") {
    return { id, type: "boolean", parentId, key, children: [], value };
  }

  throw new Error(`Unsupported JSON value: ${String(value)}.`);
}

function insertChild(
  doc: JsonDoc,
  parentId: NodeId,
  key: string | number,
  value: JsonValue,
  allocateNodeId?: () => NodeId,
): NodeId {
  const parent = getNode(doc, parentId);

  if (parent.type === "object") {
    if (typeof key !== "string") {
      throw new Error("Object children require a string key.");
    }

    if (findChildByKey(doc, parentId, key) !== null) {
      throw new Error(`Object key already exists: ${key}.`);
    }

    const childId = createSubtree(doc, value, parentId, key, undefined, allocateNodeId);
    parent.children.push(childId);
    return childId;
  }

  if (parent.type === "array") {
    if (typeof key !== "number") {
      throw new Error("Array children require a numeric index.");
    }

    if (!Number.isInteger(key)) {
      throw new Error(`Array index must be an integer: ${key}.`);
    }

    if (key < 0 || key > parent.children.length) {
      throw new Error(`Array index out of bounds: ${key}.`);
    }

    const childId = createSubtree(doc, value, parentId, key, undefined, allocateNodeId);
    parent.children.splice(key, 0, childId);
    normalizeArrayKeys(doc, parent.id);
    return childId;
  }

  throw new Error(`Cannot insert child into ${parent.type} node.`);
}

function replaceSubtree(
  doc: JsonDoc,
  nodeId: NodeId,
  value: JsonValue,
  allocateNodeId?: () => NodeId,
): void {
  const current = getNode(doc, nodeId);
  const parentId = current.parentId;
  const key = current.key;

  for (const descendantId of collectDescendants(doc, nodeId)) {
    delete doc.nodes[descendantId];
  }

  createSubtree(doc, value, parentId, key, nodeId, allocateNodeId);
}

function removeSubtree(doc: JsonDoc, nodeId: NodeId): void {
  const node = getNode(doc, nodeId);

  if (node.parentId === null) {
    throw new Error("Cannot remove the root node.");
  }

  const parent = getNode(doc, node.parentId);
  parent.children = parent.children.filter((childId) => childId !== nodeId);

  for (const id of [nodeId, ...collectDescendants(doc, nodeId)]) {
    delete doc.nodes[id];
  }

  if (parent.type === "array") {
    normalizeArrayKeys(doc, parent.id);
  }
}

function ensureObjectArrayField(
  doc: JsonDoc,
  objectId: NodeId,
  key: string,
  allocateNodeId?: () => NodeId,
): NodeId {
  const objectNode = getNode(doc, objectId);

  if (objectNode.type !== "object") {
    throw new Error("Target node is not an object.");
  }

  const existing = findChildByKey(doc, objectId, key);

  if (existing !== null) {
    if (existing.type !== "array") {
      throw new Error(`Existing ${key} field is not an array.`);
    }

    return existing.id;
  }

  return insertChild(doc, objectId, key, [], allocateNodeId);
}

function collectDescendants(doc: JsonDoc, nodeId: NodeId): NodeId[] {
  const node = getNode(doc, nodeId);
  const descendants: NodeId[] = [];

  for (const childId of node.children) {
    descendants.push(childId, ...collectDescendants(doc, childId));
  }

  return descendants;
}

function normalizeArrayKeys(doc: JsonDoc, arrayId: NodeId): void {
  const arrayNode = getNode(doc, arrayId);

  if (arrayNode.type !== "array") {
    return;
  }

  arrayNode.children.forEach((childId, index) => {
    getNode(doc, childId).key = index;
  });
}

function findChildByKey(doc: JsonDoc, parentId: NodeId, key: JsonKey): JsonNode | null {
  const parent = getNode(doc, parentId);

  for (const childId of parent.children) {
    const child = getNode(doc, childId);

    if (child.key === key) {
      return child;
    }
  }

  return null;
}

function getNode(doc: JsonDoc, nodeId: NodeId): JsonNode {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    throw new Error(`Node not found: ${nodeId}.`);
  }

  return node;
}

function nextNodeId(doc: JsonDoc): NodeId {
  let index = Object.keys(doc.nodes).length + 1;

  while (doc.nodes[`n${index}`] !== undefined) {
    index += 1;
  }

  return `n${index}`;
}

function maxNodeIndex(doc: JsonDoc): number {
  let max = 0;

  for (const id of Object.keys(doc.nodes)) {
    const match = /^n(\d+)$/.exec(id);

    if (match === null) {
      continue;
    }

    max = Math.max(max, Number(match[1]));
  }

  return max;
}

function schemaAtPath(schema: AnySchema, path: JsonPath): AnySchema | null {
  let current: AnySchema | null = schema;

  for (const key of path) {
    if (current === null) {
      return null;
    }

    current = schemaChild(current, key);
  }

  return current;
}

function schemaChild(schema: AnySchema, key: string | number): AnySchema | null {
  const current = unwrapTransparent(schema);
  const type = schemaType(current);

  if (type === "object") {
    if (typeof key !== "string") {
      return null;
    }

    return objectShape(current)[key] ?? objectCatchall(current);
  }

  if (type === "array") {
    if (typeof key !== "number" || !Number.isInteger(key)) {
      return null;
    }

    return arrayElement(current);
  }

  if (type === "tuple") {
    if (typeof key !== "number" || !Number.isInteger(key)) {
      return null;
    }

    return tupleElement(current, key);
  }

  if (type === "record") {
    return recordValue(current, key);
  }

  if (type === "intersection") {
    return intersectionChild(current, key);
  }

  if (type === "pipe") {
    return pipeChild(current, key);
  }

  if (type === "union") {
    const options = unionOptions(current);
    const children = options
      .map((option) => schemaChild(option, key))
      .filter((option): option is AnySchema => option !== null);

    if (children.length === 0) {
      return null;
    }

    if (children.length === 1) {
      return children[0]!;
    }

    return z.union(children as [AnySchema, AnySchema, ...AnySchema[]]);
  }

  return null;
}

function unwrapTransparent(schema: AnySchema): AnySchema {
  let current = schema;

  for (let depth = 0; depth < 20; depth += 1) {
    const type = schemaType(current);

    if (
      type === "optional" ||
      type === "nullable" ||
      type === "default" ||
      type === "catch" ||
      type === "readonly" ||
      type === "lazy"
    ) {
      const unwrapped = unwrapOne(current);

      if (unwrapped === null || unwrapped === current) {
        return current;
      }

      current = unwrapped;
      continue;
    }

    return current;
  }

  return current;
}

function unwrapOne(schema: AnySchema): AnySchema | null {
  const maybeUnwrap = (schema as { unwrap?: () => AnySchema }).unwrap;

  if (typeof maybeUnwrap === "function") {
    return maybeUnwrap.call(schema);
  }

  const def = schemaDef(schema);
  return (def.innerType as AnySchema | undefined) ?? null;
}

function objectArrayFieldKeys(schema: AnySchema): string[] {
  const current = unwrapTransparent(schema);
  const type = schemaType(current);
  const keys = new Set<string>();

  if (type === "object") {
    for (const [key, childSchema] of Object.entries(objectShape(current))) {
      if (schemaAllowsArray(childSchema)) {
        keys.add(key);
      }
    }

    return [...keys];
  }

  if (type === "union") {
    for (const option of unionOptions(current)) {
      for (const key of objectArrayFieldKeys(option)) {
        keys.add(key);
      }
    }

    return [...keys];
  }

  if (type === "intersection") {
    const def = schemaDef(current);
    const left = def.left as AnySchema | undefined;
    const right = def.right as AnySchema | undefined;

    for (const side of [left, right]) {
      if (side === undefined) {
        continue;
      }

      for (const key of objectArrayFieldKeys(side)) {
        keys.add(key);
      }
    }
  }

  return [...keys];
}

function schemaAllowsArray(schema: AnySchema): boolean {
  const current = unwrapTransparent(schema);
  const type = schemaType(current);

  if (type === "array") {
    return true;
  }

  if (type === "union") {
    return unionOptions(current).some(schemaAllowsArray);
  }

  if (type === "intersection") {
    const def = schemaDef(current);
    const left = def.left as AnySchema | undefined;
    const right = def.right as AnySchema | undefined;

    return left !== undefined && right !== undefined && schemaAllowsArray(left) && schemaAllowsArray(right);
  }

  if (type === "pipe") {
    const def = schemaDef(current);
    const output = def.out as AnySchema | undefined;
    const input = def.in as AnySchema | undefined;

    return (output !== undefined && schemaAllowsArray(output)) || (input !== undefined && schemaAllowsArray(input));
  }

  return false;
}

function arrayElement(schema: AnySchema): AnySchema | null {
  const current = unwrapTransparent(schema);
  const element = (current as { element?: AnySchema }).element;

  if (element !== undefined) {
    return element;
  }

  const def = schemaDef(current);
  return (def.element as AnySchema | undefined) ?? (def.type as AnySchema | undefined) ?? null;
}

function tupleElement(schema: AnySchema, index: number): AnySchema | null {
  const def = schemaDef(schema);
  const items = def.items as AnySchema[] | undefined;

  if (items?.[index] !== undefined) {
    return items[index]!;
  }

  return (def.rest as AnySchema | undefined) ?? null;
}

function objectCatchall(schema: AnySchema): AnySchema | null {
  const catchall = schemaDef(schema).catchall as AnySchema | undefined;

  if (catchall === undefined || schemaType(catchall) === "never") {
    return null;
  }

  return catchall;
}

function recordValue(schema: AnySchema, key: string | number): AnySchema | null {
  if (typeof key !== "string") {
    return null;
  }

  const def = schemaDef(schema);
  const keySchema = def.keyType as AnySchema | undefined;

  if (keySchema !== undefined && !recordKeyMatches(keySchema, key)) {
    return null;
  }

  return (def.valueType as AnySchema | undefined) ?? null;
}

function intersectionChild(schema: AnySchema, key: string | number): AnySchema | null {
  const def = schemaDef(schema);
  const left = def.left as AnySchema | undefined;
  const right = def.right as AnySchema | undefined;

  if (left === undefined || right === undefined) {
    return null;
  }

  const leftChild = schemaChild(left, key);
  const rightChild = schemaChild(right, key);

  if (leftChild === null) {
    return rightChild;
  }

  if (rightChild === null) {
    return leftChild;
  }

  return z.intersection(leftChild, rightChild);
}

function pipeChild(schema: AnySchema, key: string | number): AnySchema | null {
  const def = schemaDef(schema);
  const output = def.out as AnySchema | undefined;
  const input = def.in as AnySchema | undefined;

  if (output !== undefined) {
    const outputChild = schemaChild(output, key);

    if (outputChild !== null) {
      return outputChild;
    }
  }

  return input === undefined ? null : schemaChild(input, key);
}

function recordKeyMatches(keySchema: AnySchema, key: string): boolean {
  if (keySchema.safeParse(key).success) {
    return true;
  }

  if (schemaType(unwrapTransparent(keySchema)) !== "number") {
    return false;
  }

  const numericKey = Number(key);

  return Number.isFinite(numericKey) && keySchema.safeParse(numericKey).success;
}


function objectShape(schema: AnySchema): Record<string, AnySchema> {
  const shape = (schema as { shape?: Record<string, AnySchema> }).shape;

  if (shape !== undefined) {
    return shape;
  }

  const def = schemaDef(schema);
  const defShape = def.shape as Record<string, AnySchema> | (() => Record<string, AnySchema>) | undefined;

  if (typeof defShape === "function") {
    return defShape();
  }

  return defShape ?? {};
}

function unionOptions(schema: AnySchema): AnySchema[] {
  const options = (schema as { options?: AnySchema[] }).options;

  if (options !== undefined) {
    return options;
  }

  const def = schemaDef(schema);
  return (def.options as AnySchema[] | undefined) ?? [];
}

function schemaType(schema: AnySchema): string {
  return (
    (schema as { type?: string }).type ??
    (schema as { def?: { type?: string } }).def?.type ??
    (schema as { _def?: { type?: string } })._def?.type ??
    ""
  );
}

function schemaDef(schema: AnySchema): Record<string, unknown> {
  const schemaWithDef = schema as unknown as {
    def?: Record<string, unknown>;
    _def?: Record<string, unknown>;
  };

  return (
    schemaWithDef.def ??
    schemaWithDef._def ??
    {}
  );
}

function cloneDoc(doc: JsonDoc): JsonDoc {
  const nodes: Record<NodeId, JsonNode> = {};

  for (const [id, node] of Object.entries(doc.nodes)) {
    nodes[id] = { ...node, children: [...node.children] };
  }

  return { rootId: doc.rootId, nodes };
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sameJson(left: JsonValue, right: JsonValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((item, index) => sameJson(item, right[index]!));
  }

  if (isJsonObject(left) || isJsonObject(right)) {
    if (!isJsonObject(left) || !isJsonObject(right)) {
      return false;
    }

    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();

    if (leftKeys.length !== rightKeys.length || !leftKeys.every((key, index) => key === rightKeys[index])) {
      return false;
    }

    return leftKeys.every((key) => sameJson(left[key]!, right[key]!));
  }

  return left === right;
}

function firstJsonDifference(expected: JsonValue, actual: JsonValue, path: JsonPath = []): string | null {
  if (sameJson(expected, actual)) {
    return null;
  }

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return `${formatPath(path)} changed type from ${jsonType(actual)} to ${jsonType(expected)}`;
    }

    const length = Math.max(expected.length, actual.length);

    for (let index = 0; index < length; index += 1) {
      if (index >= expected.length) {
        return `${formatPath([...path, index])} would be removed by schema`;
      }

      if (index >= actual.length) {
        return `${formatPath([...path, index])} would be added by schema`;
      }

      const difference = firstJsonDifference(expected[index]!, actual[index]!, [...path, index]);

      if (difference !== null) {
        return difference;
      }
    }

    return null;
  }

  if (isJsonObject(expected) || isJsonObject(actual)) {
    if (!isJsonObject(expected) || !isJsonObject(actual)) {
      return `${formatPath(path)} changed type from ${jsonType(actual)} to ${jsonType(expected)}`;
    }

    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();

    for (const key of keys) {
      if (!hasOwn(expected, key)) {
        return `${formatPath([...path, key])} would be removed by schema`;
      }

      if (!hasOwn(actual, key)) {
        return `${formatPath([...path, key])} would be added by schema`;
      }

      const difference = firstJsonDifference(expected[key]!, actual[key]!, [...path, key]);

      if (difference !== null) {
        return difference;
      }
    }

    return null;
  }

  return `${formatPath(path)} would change from ${JSON.stringify(actual)} to ${JSON.stringify(expected)}`;
}

function jsonType(value: JsonValue): string {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

function isJsonObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function formatPath(path: JsonPath): string {
  if (path.length === 0) {
    return "$";
  }

  return path.reduce<string>((text, segment) => {
    if (typeof segment === "number") {
      return `${text}[${segment}]`;
    }

    return `${text}.${segment}`;
  }, "$");
}

function failure(error: unknown): OperationResult {
  return {
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  };
}
