import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "@interactive-os/json-document";

export type LimitItemsErrorCode =
  | "invalid_pointer"
  | "invalid_max"
  | "path_not_found"
  | "not_array"
  | "patch_rejected"
  | "patch_failed";

export interface LimitItemsError {
  ok: false;
  code: LimitItemsErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface LimitItemsOptions {
  /** Which end to keep when trimming. `"start"` keeps the first `max`, `"end"` keeps the last `max`. Default `"start"`. */
  from?: "start" | "end";
}

export interface LimitItemsChange<TValue = unknown> {
  ok: true;
  path: Pointer;
  /** Item count before. */
  count: number;
  /** Number of items dropped. */
  removed: number;
  changed: boolean;
  /** The kept items, in order. */
  values: ReadonlyArray<TValue>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type LimitItemsResult<TValue = unknown> = LimitItemsChange<TValue> | LimitItemsError;

export interface LimitItems<TDocument> {
  canLimitItems<TValue = unknown>(path: Pointer, max: number, options?: LimitItemsOptions): LimitItemsResult<TValue>;
  limitItems<TValue = unknown>(path: Pointer, max: number, options?: LimitItemsOptions): LimitItemsResult<TValue>;
}
