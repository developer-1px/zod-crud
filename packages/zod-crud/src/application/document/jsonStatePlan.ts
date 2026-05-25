import type * as z from "zod";

import type { JSONPatchOperation, JSONResult } from "../../foundation/json-patch/index.js";
import { jsonSerializableError } from "../../foundation/json.js";

export interface JSONStateCommitInput<T> {
  current: T;
  currentJsonTrusted: boolean;
  next: T;
  result: JSONResult;
  applied: ReadonlyArray<JSONPatchOperation>;
  unchangedStateJsonTrusted?: boolean;
  changedStateJsonTrusted: boolean;
}

export interface JSONStateCommitPlan<T> {
  result: JSONResult;
  state: T;
  stateJsonTrusted: boolean;
  notifyApplied: ReadonlyArray<JSONPatchOperation> | null;
}

export interface JSONRootReplacementInput<T> {
  next: T;
  schemaOutputJsonTrusted: boolean;
}

export interface JSONRootReplacementParseInput<T> {
  result: { success: true; data: T } | { success: false; error: z.ZodError };
  schemaOutputJsonTrusted: boolean;
}

export interface JSONRootReplacementPlan<T> {
  result: JSONResult;
  state: T;
  stateJsonTrusted: boolean;
  notifyApplied: ReadonlyArray<JSONPatchOperation>;
}

export type JSONRootReplacementParsePlan<T> =
  | ({ kind: "replace" } & JSONRootReplacementPlan<T>)
  | { kind: "error"; result: Extract<JSONResult, { ok: false }> };

export interface JSONNotificationInput {
  applied: ReadonlyArray<JSONPatchOperation>;
  disposed: boolean;
}

export interface JSONNotificationPlan {
  lastApplied: ReadonlyArray<JSONPatchOperation> | null;
}

const ROOT_REPLACE = (value: unknown): JSONPatchOperation => ({ op: "replace", path: "", value });

export function planJSONStateCommit<T>(
  input: JSONStateCommitInput<T>,
): JSONStateCommitPlan<T> {
  if (!input.result.ok) {
    return {
      result: input.result,
      state: input.current,
      stateJsonTrusted: input.currentJsonTrusted,
      notifyApplied: null,
    };
  }

  if (input.next === input.current) {
    return {
      result: input.result,
      state: input.current,
      stateJsonTrusted: input.unchangedStateJsonTrusted ?? input.currentJsonTrusted,
      notifyApplied: null,
    };
  }

  return {
    result: input.result,
    state: input.next,
    stateJsonTrusted: input.changedStateJsonTrusted,
    notifyApplied: input.applied,
  };
}

export function planJSONNotification(
  input: JSONNotificationInput,
): JSONNotificationPlan {
  return input.applied.length === 0 || input.disposed
    ? { lastApplied: null }
    : { lastApplied: input.applied };
}

function planJSONRootReplacement<T>(
  input: JSONRootReplacementInput<T>,
): JSONRootReplacementPlan<T> {
  return {
    result: { ok: true },
    state: input.next,
    stateJsonTrusted: input.schemaOutputJsonTrusted || jsonSerializableError(input.next) === null,
    notifyApplied: [ROOT_REPLACE(input.next)],
  };
}

export function planJSONRootReplacementParse<T>(
  input: JSONRootReplacementParseInput<T>,
): JSONRootReplacementParsePlan<T> {
  if (!input.result.success) {
    return {
      kind: "error",
      result: {
        ok: false,
        code: "schema_violation",
        reason: JSON.stringify(input.result.error.issues),
      },
    };
  }
  return {
    kind: "replace",
    ...planJSONRootReplacement({
      next: input.result.data,
      schemaOutputJsonTrusted: input.schemaOutputJsonTrusted,
    }),
  };
}
