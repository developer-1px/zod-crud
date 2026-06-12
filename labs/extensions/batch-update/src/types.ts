import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "@interactive-os/json-document";

export type BatchUpdateErrorCode =
  | "empty_targets"
  | "invalid_field"
  | "invalid_pointer"
  | "path_not_found"
  | "value_failed"
  | "patch_rejected"
  | "patch_failed";

export interface BatchUpdateError {
  ok: false;
  code: BatchUpdateErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

/** A constant value, or a host function computing the value per target. */
export type BatchUpdateValue<TValue = unknown> =
  | { value: TValue }
  | { compute: (current: unknown, pointer: Pointer, index: number) => TValue };

export interface BatchUpdateOptions {
  /** Relative sub-pointer written inside each target item, e.g. `"/status"`. Default `""` replaces the whole item. */
  field?: Pointer;
}

export interface BatchUpdateChange {
  ok: true;
  /** Write pointers actually targeted (target + field), in input order. */
  pointers: ReadonlyArray<Pointer>;
  count: number;
  /** Number of writes that change a value. */
  changed: number;
  operations: ReadonlyArray<JSONPatchOperation>;
  /** Original target item pointers, for hosts that keep selection. */
  selectionAfter: ReadonlyArray<Pointer>;
}

export type BatchUpdateResult = BatchUpdateChange | BatchUpdateError;

export interface BatchUpdate<TDocument> {
  canBatchUpdate<TValue = unknown>(targets: ReadonlyArray<Pointer>, value: BatchUpdateValue<TValue>, options?: BatchUpdateOptions): BatchUpdateResult;
  batchUpdate<TValue = unknown>(targets: ReadonlyArray<Pointer>, value: BatchUpdateValue<TValue>, options?: BatchUpdateOptions): BatchUpdateResult;
}
