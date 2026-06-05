import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "zod-crud";

export type FillSeriesErrorCode =
  | "empty_target"
  | "invalid_pointer"
  | "mixed_parent"
  | "not_contiguous"
  | "path_not_found"
  | "not_array"
  | "index_out_of_range"
  | "generator_failed"
  | "patch_rejected"
  | "patch_failed";

export interface FillSeriesError {
  ok: false;
  code: FillSeriesErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

/** A single target slot inside the contiguous fill range. */
export interface FillCell {
  /** Pointer that receives the value (item pointer, or item pointer + field). */
  pointer: Pointer;
  /** Array item pointer regardless of `field`. */
  itemPointer: Pointer;
  /** Absolute array index of the item. */
  index: number;
  /** 0-based position within the fill range. */
  offset: number;
  /** Current value at `pointer`, or `undefined` if absent. */
  current: unknown;
}

export type FillGenerator<TValue = unknown> = (cell: FillCell) => TValue;

/** Constant value, linear numeric series, or host generator. */
export type FillSource<TValue = unknown> =
  | { value: TValue }
  | { series: { step: number; start?: number } }
  | { from: FillGenerator<TValue> };

export interface FillOptions {
  /** Relative sub-pointer written inside each item, e.g. `"/qty"`. Default `""` writes the whole item. */
  field?: Pointer;
}

export interface FillSeriesChange<TValue = unknown> {
  ok: true;
  /** Parent array pointer of the filled range. */
  path: Pointer;
  /** Relative field written inside each item (`""` for the whole item). */
  field: Pointer;
  count: number;
  changed: boolean;
  /** Target write pointers in range order. */
  pointers: ReadonlyArray<Pointer>;
  /** Computed values in range order (every cell, not only changed ones). */
  values: ReadonlyArray<TValue>;
  operations: ReadonlyArray<JSONPatchOperation>;
  /** Item pointers in range order, for hosts that keep selection after the fill. */
  selectionAfter: ReadonlyArray<Pointer>;
}

export type FillSeriesResult<TValue = unknown> =
  | FillSeriesChange<TValue>
  | FillSeriesError;

export interface FillSeries<TDocument> {
  canFill<TValue = unknown>(
    target: ReadonlyArray<Pointer>,
    source: FillSource<TValue>,
    options?: FillOptions,
  ): FillSeriesResult<TValue>;
  fill<TValue = unknown>(
    target: ReadonlyArray<Pointer>,
    source: FillSource<TValue>,
    options?: FillOptions,
  ): FillSeriesResult<TValue>;
}

export interface NormalizedRange {
  ok: true;
  parent: Pointer;
  indices: number[];
}
