import type { OperationFailureCode, OperationResult } from "./types.js";

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
