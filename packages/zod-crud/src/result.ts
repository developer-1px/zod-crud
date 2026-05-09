import type { ZodError } from "zod";

import type {
  FocusFilter,
  JsonChange,
  JsonDoc,
  JsonPath,
  NodeId,
} from "./document/json-doc-types.js";
import { focusFromMutation } from "./focus.js";

export type OperationFailureCode =
  | "change_conflict"
  | "clipboard_empty"
  | "duplicate_key"
  | "empty_selection"
  | "exception"
  | "invalid_target"
  | "locked_region"
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

