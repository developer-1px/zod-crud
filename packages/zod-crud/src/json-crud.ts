import type * as z from "zod";

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
import { createJsonCrudInstance } from "./json-crud-instance.js";
import type { SelectionPlan } from "./selection/json-selection.js";

type OperationFailure = Extract<OperationResult, { ok: false }>;

export type JsonCrud<T extends JsonValue = JsonValue, I = unknown> = {
  snapshot: () => JsonDoc;
  toJson: () => T;
  read: (nodeId?: NodeId) => JsonValue;
  pathOf: (nodeId: NodeId) => JsonPath;
  find: (parentId: NodeId, key: JsonKey) => NodeId | null;
  normalizeSelection: (nodeIds: NodeId[]) => SelectionPlan | OperationFailure;
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
  deleteMany: (nodeIds: NodeId[]) => OperationResult;
  moveBefore: (nodeIds: NodeId[], siblingId: NodeId) => OperationResult;
  canMoveBefore: (nodeIds: NodeId[], siblingId: NodeId) => OperationResult;
  moveAfter: (nodeIds: NodeId[], siblingId: NodeId) => OperationResult;
  canMoveAfter: (nodeIds: NodeId[], siblingId: NodeId) => OperationResult;
  moveInto: (nodeIds: NodeId[], parentId: NodeId, index?: number) => OperationResult;
  canMoveInto: (nodeIds: NodeId[], parentId: NodeId, index?: number) => OperationResult;
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
  return createJsonCrudInstance(schema, initialValue, options);
}
