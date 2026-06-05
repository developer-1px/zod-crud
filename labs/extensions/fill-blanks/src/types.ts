import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "zod-crud";

export type FillBlanksErrorCode =
  | "empty_targets"
  | "invalid_field"
  | "invalid_pointer"
  | "path_not_found"
  | "value_failed"
  | "patch_rejected"
  | "patch_failed";

export interface FillBlanksError {
  ok: false;
  code: FillBlanksErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

/** A constant value, or a host function computing the fill value per target. */
export type FillBlanksValue<TValue = unknown> =
  | { value: TValue }
  | { compute: (pointer: Pointer, index: number) => TValue };

export interface FillBlanksOptions {
  /** Relative sub-pointer written inside each target, e.g. `"/status"`. Default `""`. */
  field?: Pointer;
  /** Decide whether the current value counts as empty. Default: null, "", or []. */
  isEmpty?: (current: unknown) => boolean;
}

export interface FillBlanksChange {
  ok: true;
  /** Write pointers considered, in input order. */
  pointers: ReadonlyArray<Pointer>;
  count: number;
  /** Number of empty slots filled. */
  filled: number;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionAfter: ReadonlyArray<Pointer>;
}

export type FillBlanksResult = FillBlanksChange | FillBlanksError;

export interface FillBlanks<TDocument> {
  canFillBlanks<TValue = unknown>(targets: ReadonlyArray<Pointer>, value: FillBlanksValue<TValue>, options?: FillBlanksOptions): FillBlanksResult;
  fillBlanks<TValue = unknown>(targets: ReadonlyArray<Pointer>, value: FillBlanksValue<TValue>, options?: FillBlanksOptions): FillBlanksResult;
}
