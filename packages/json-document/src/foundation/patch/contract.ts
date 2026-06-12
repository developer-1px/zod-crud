import type * as z from "zod";
import type { Pointer } from "../pointer/index.js";

export type JSONPatchOperation =
  | { op: "add";     path: Pointer; value: unknown }
  | { op: "remove";  path: Pointer }
  | { op: "replace"; path: Pointer; value: unknown }
  | { op: "move";    from: Pointer; path: Pointer }
  | { op: "copy";    from: Pointer; path: Pointer }
  | { op: "test";    path: Pointer; value: unknown };

export type ErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "move_into_self"
  | "schema_violation"
  | "test_failed"
  | "not_serializable";

export type JSONResult =
  | { ok: true }
  | { ok: false; code: ErrorCode; reason?: string; pointer?: Pointer };

export interface ApplyResult<S extends z.ZodTypeAny> {
  state: z.output<S>;
  result: JSONResult;
  applied: ReadonlyArray<JSONPatchOperation>;
}

export interface TrustedApplyResult<T> {
  state: T;
  result: JSONResult;
  applied: ReadonlyArray<JSONPatchOperation>;
}

export interface TrustedPatchOptions {
  valuesTrusted?: boolean;
}

export type FastPatchResult =
  | { handled: true; state: unknown; applied: ReadonlyArray<JSONPatchOperation> }
  | { handled: false };
