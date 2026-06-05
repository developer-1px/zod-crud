import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "zod-crud";

export type ApplyDefaultsErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_object"
  | "patch_rejected"
  | "patch_failed";

export interface ApplyDefaultsError {
  ok: false;
  code: ApplyDefaultsErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface ApplyDefaultsChange {
  ok: true;
  path: Pointer;
  /** Keys that were missing and added, in defaults order. */
  added: ReadonlyArray<string>;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type ApplyDefaultsResult = ApplyDefaultsChange | ApplyDefaultsError;

export interface ApplyDefaults<TDocument> {
  canEnsure(path: Pointer, defaults: Readonly<Record<string, unknown>>): ApplyDefaultsResult;
  ensure(path: Pointer, defaults: Readonly<Record<string, unknown>>): ApplyDefaultsResult;
}
