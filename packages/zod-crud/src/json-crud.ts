import type * as z from "zod";

import type {
  JsonChange,
  JsonCrudOptions,
  JsonDoc,
  JsonKey,
  JsonNode,
  JsonNodeType,
  JsonPath,
  JsonValue,
  NodeId,
  OperationResult,
  PasteOptions,
} from "./types.js";
import { createJsonCrudInstance } from "./internal/json-crud-instance.js";
import type { SelectionPlan } from "./select.js";

type OperationFailure = Extract<OperationResult, { ok: false }>;

export type WalkVisitor = (node: JsonNode, path: JsonPath) => void | "skip" | "stop";
export type NodePredicate = (node: JsonNode, path: JsonPath) => boolean;
export type ChangeListener = (changes: JsonChange[]) => void;

export type Transaction = {
  create: (parentId: NodeId, key: string | number, value?: JsonValue) => OperationResult;
  insertAfter: (siblingId: NodeId, value?: JsonValue) => OperationResult;
  insertBefore: (siblingId: NodeId, value?: JsonValue) => OperationResult;
  appendChild: (parentId: NodeId, value?: JsonValue) => OperationResult;
  update: (nodeId: NodeId, value: JsonValue) => OperationResult;
  rename: (nodeId: NodeId, key: string) => OperationResult;
  delete: (nodeId: NodeId) => OperationResult;
  deleteMany: (nodeIds: NodeId[]) => OperationResult;
  moveBefore: (nodeIds: NodeId[], siblingId: NodeId) => OperationResult;
  moveAfter: (nodeIds: NodeId[], siblingId: NodeId) => OperationResult;
  moveInto: (nodeIds: NodeId[], parentId: NodeId, index?: number) => OperationResult;
  wrap: (nodeId: NodeId, key: string) => OperationResult;
  unwrap: (nodeId: NodeId) => OperationResult;
  indent: (nodeId: NodeId) => OperationResult;
  outdent: (nodeId: NodeId) => OperationResult;
  split: (nodeId: NodeId, at: number) => OperationResult;
  join: (nodeId: NodeId, withId: NodeId) => OperationResult;
};

export type TransactionResult<R> = OperationResult & { value?: R };

export type JsonCrud<T extends JsonValue = JsonValue, I = unknown> = {
  // ── read ───────────────────────────────────────────
  snapshot: () => JsonDoc;
  toJson: () => T;
  read: (nodeId?: NodeId) => JsonValue;
  pathOf: (nodeId: NodeId) => JsonPath;
  find: (parentId: NodeId, key: JsonKey) => NodeId | null;
  findAll: (predicate: NodePredicate) => NodeId[];
  walk: (visit: WalkVisitor) => void;

  // ── selection ──────────────────────────────────────
  select: (nodeIds: NodeId[]) => SelectionPlan | OperationFailure;

  // ── mutate (single) ────────────────────────────────
  create: (parentId: NodeId, key: string | number, value?: JsonValue) => OperationResult;
  canCreate: (parentId: NodeId, key: string | number, value?: JsonValue) => OperationResult;
  insertAfter: (siblingId: NodeId, value?: JsonValue) => OperationResult;
  canInsertAfter: (siblingId: NodeId, value?: JsonValue) => OperationResult;
  insertBefore: (siblingId: NodeId, value?: JsonValue) => OperationResult;
  canInsertBefore: (siblingId: NodeId, value?: JsonValue) => OperationResult;
  appendChild: (parentId: NodeId, value?: JsonValue) => OperationResult;
  canAppendChild: (parentId: NodeId, value?: JsonValue) => OperationResult;
  update: (nodeId: NodeId, value: JsonValue) => OperationResult;
  canUpdate: (nodeId: NodeId, value: JsonValue) => OperationResult;
  rename: (nodeId: NodeId, key: string) => OperationResult;
  canRename: (nodeId: NodeId, key: string) => OperationResult;
  delete: (nodeId: NodeId) => OperationResult;
  canDelete: (nodeId: NodeId) => OperationResult;

  // ── mutate (multi) ─────────────────────────────────
  deleteMany: (nodeIds: NodeId[]) => OperationResult;
  canDeleteMany: (nodeIds: NodeId[]) => OperationResult;
  moveBefore: (nodeIds: NodeId[], siblingId: NodeId) => OperationResult;
  canMoveBefore: (nodeIds: NodeId[], siblingId: NodeId) => OperationResult;
  moveAfter: (nodeIds: NodeId[], siblingId: NodeId) => OperationResult;
  canMoveAfter: (nodeIds: NodeId[], siblingId: NodeId) => OperationResult;
  moveInto: (nodeIds: NodeId[], parentId: NodeId, index?: number) => OperationResult;
  canMoveInto: (nodeIds: NodeId[], parentId: NodeId, index?: number) => OperationResult;

  // ── mutate (transaction) ── stub ───────────────────
  transact: <R>(fn: (tx: Transaction) => R) => TransactionResult<R>;

  // ── mutate (tree-shape) ── stubs ───────────────────
  wrap: (nodeId: NodeId, key: string) => OperationResult;
  canWrap: (nodeId: NodeId, key: string) => OperationResult;
  unwrap: (nodeId: NodeId) => OperationResult;
  canUnwrap: (nodeId: NodeId) => OperationResult;
  indent: (nodeId: NodeId) => OperationResult;
  canIndent: (nodeId: NodeId) => OperationResult;
  outdent: (nodeId: NodeId) => OperationResult;
  canOutdent: (nodeId: NodeId) => OperationResult;
  split: (nodeId: NodeId, at: number) => OperationResult;
  canSplit: (nodeId: NodeId, at: number) => OperationResult;
  join: (nodeId: NodeId, withId: NodeId) => OperationResult;
  canJoin: (nodeId: NodeId, withId: NodeId) => OperationResult;

  // ── clipboard ──────────────────────────────────────
  copy: (nodeId: NodeId) => JsonValue;
  copyMany: (nodeIds: NodeId[]) => JsonValue[];
  canCopyMany: (nodeIds: NodeId[]) => OperationResult;
  cut: (nodeId: NodeId) => OperationResult;
  cutMany: (nodeIds: NodeId[]) => OperationResult;
  canCutMany: (nodeIds: NodeId[]) => OperationResult;
  paste: (targetId: NodeId, options?: PasteOptions) => OperationResult;
  canPaste: (targetId: NodeId, options?: PasteOptions) => OperationResult;

  // ── history ────────────────────────────────────────
  undo: () => OperationResult;
  redo: () => OperationResult;
  canUndo: () => boolean;
  canRedo: () => boolean;
  subscribe: (listener: ChangeListener) => () => void;
  applyChanges: (changes: JsonChange[]) => OperationResult;
  invertChanges: (changes: JsonChange[]) => JsonChange[];
  diff: (other: JsonDoc) => JsonChange[];

  // ── lifecycle / dirty ── stubs ─────────────────────
  markClean: () => void;
  isDirty: () => boolean;
  savedSnapshot: () => JsonDoc;

  // ── schema introspection ── stubs ──────────────────
  insertableKeys: (parentId: NodeId) => string[];
  insertableTypes: (parentId: NodeId, key?: string) => JsonNodeType[];

  // ── locked regions ── stubs ────────────────────────
  lock: (nodeId: NodeId) => void;
  unlock: (nodeId: NodeId) => void;
  isLocked: (nodeId: NodeId) => boolean;
};

export function createJsonCrud<T extends JsonValue, I = unknown>(
  schema: z.ZodType<T, I>,
  initialValue: I,
  options: JsonCrudOptions = {},
): JsonCrud<T, I> {
  return createJsonCrudInstance(schema, initialValue, options);
}
