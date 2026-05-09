import type { ZodError } from "zod";

import type {
  FocusFilter,
  JsonChange,
  JsonDoc,
  JsonPath,
  NodeId,
} from "./document/json-doc-types.js";

export type OperationFailureCode =
  | "clipboard_empty"
  | "duplicate_key"
  | "empty_selection"
  | "exception"
  | "invalid_target"
  | "missing_default"
  | "not_implemented"
  | "root_operation"
  | "schema_mismatch";

export type OperationResult =
  | {
      ok: true;
      nodeId?: NodeId;
      focusNodeId?: NodeId;
      focusNodeIds?: NodeId[];
      changes?: JsonChange[];
    }
  | {
      ok: false;
      code?: OperationFailureCode;
      reason: string;
      nodeId?: NodeId;
      path?: JsonPath;
      error?: ZodError;
    };

export function failure(error: unknown, code: OperationFailureCode = codeForError(error)): OperationResult {
  return {
    ok: false,
    code,
    reason: error instanceof Error ? error.message : String(error),
  };
}

function codeForError(error: unknown): OperationFailureCode {
  const message = error instanceof Error ? error.message : String(error);

  if (message.startsWith("Object key already exists:")) {
    return "duplicate_key";
  }

  if (
    message.startsWith("Cannot ") ||
    message.includes("requires ") ||
    message.includes("out of bounds") ||
    message.includes("not present")
  ) {
    return "invalid_target";
  }

  return "exception";
}

export function successResult(
  before: JsonDoc,
  after: JsonDoc,
  changes: JsonChange[],
  nodeId?: NodeId,
  focusNodeId?: NodeId,
  focusNodeIds?: NodeId[],
  focusFilter?: FocusFilter,
): OperationResult {
  return {
    ok: true,
    ...(nodeId === undefined ? {} : { nodeId }),
    focusNodeId: focusNodeId ?? focusFromMutation(before, after, changes, nodeId, focusFilter),
    ...(focusNodeIds === undefined ? {} : { focusNodeIds }),
    changes,
  };
}

export function focusFromMutation(
  before: JsonDoc,
  after: JsonDoc,
  changes: JsonChange[],
  primaryNodeId?: NodeId,
  focusFilter?: FocusFilter,
): NodeId {
  if (isFocusCandidate(after, primaryNodeId, focusFilter)) {
    return primaryNodeId;
  }

  if (primaryNodeId !== undefined && before.nodes[primaryNodeId] !== undefined) {
    return focusAfterPrimaryRemoval(before, after, primaryNodeId, focusFilter);
  }

  const insertedRoot = changes.find((change) =>
    change.type === "insert" &&
    change.after.parentId !== null &&
    before.nodes[change.after.parentId] !== undefined
  );

  if (isFocusCandidate(after, insertedRoot?.nodeId, focusFilter)) {
    return insertedRoot.nodeId;
  }

  const changedExisting = changes.find((change) =>
    change.type === "update" && after.nodes[change.nodeId] !== undefined
  );

  if (isFocusCandidate(after, changedExisting?.nodeId, focusFilter)) {
    return changedExisting.nodeId;
  }

  if (isFocusCandidate(after, after.rootId, focusFilter)) {
    return after.rootId;
  }

  return after.rootId;
}

function focusAfterPrimaryRemoval(
  before: JsonDoc,
  after: JsonDoc,
  removedId: NodeId,
  focusFilter?: FocusFilter,
): NodeId {
  const removed = before.nodes[removedId];
  const siblings = removed?.parentId === null || removed?.parentId === undefined
    ? []
    : before.nodes[removed.parentId]?.children ?? [];
  const index = siblings.indexOf(removedId);
  const candidates = [
    siblings[index + 1],
    siblings[index - 1],
    removed?.parentId,
    after.rootId,
  ];

  return candidates.find((id): id is NodeId => isFocusCandidate(after, id, focusFilter)) ?? after.rootId;
}

function isFocusCandidate(doc: JsonDoc, nodeId: NodeId | null | undefined, focusFilter?: FocusFilter): nodeId is NodeId {
  return nodeId !== undefined &&
    nodeId !== null &&
    doc.nodes[nodeId] !== undefined &&
    (focusFilter?.(doc, nodeId) ?? true);
}
