import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "zod-crud";

export type DedupeErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_array"
  | "key_failed"
  | "patch_rejected"
  | "patch_failed";

export interface DedupeError {
  ok: false;
  code: DedupeErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

/** Host policy: the equality key for an item. Default is whole-value JSON. */
export type DedupeKeyOf<TValue = unknown> = (item: TValue, index: number) => unknown;

export interface DedupeOptions<TValue = unknown> {
  keyOf?: DedupeKeyOf<TValue>;
}

export interface DedupeChange<TValue = unknown> {
  ok: true;
  path: Pointer;
  /** Item count before dedupe. */
  count: number;
  /** Number of duplicate items removed. */
  removed: number;
  /** Original indices that were removed (ascending). */
  removedIndices: ReadonlyArray<number>;
  changed: boolean;
  /** The deduped array (first occurrence of each key kept, in order). */
  values: ReadonlyArray<TValue>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type DedupeResult<TValue = unknown> = DedupeChange<TValue> | DedupeError;

export interface Dedupe<TDocument> {
  canDedupe<TValue = unknown>(path: Pointer, options?: DedupeOptions<TValue>): DedupeResult<TValue>;
  dedupe<TValue = unknown>(path: Pointer, options?: DedupeOptions<TValue>): DedupeResult<TValue>;
}
