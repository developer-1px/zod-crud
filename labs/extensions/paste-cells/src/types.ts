import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "zod-crud";

export type PasteCellsErrorCode =
  | "empty_matrix"
  | "no_fields"
  | "invalid_pointer"
  | "not_array_item"
  | "path_not_found"
  | "not_array"
  | "region_out_of_range"
  | "patch_rejected"
  | "patch_failed";

export interface PasteCellsError {
  ok: false;
  code: PasteCellsErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface PasteCellsTarget {
  /** Top-left item pointer, e.g. `"/rows/2"`. */
  at: Pointer;
  /** Column order as relative field sub-pointers, e.g. `["/name", "/qty"]`. */
  fields: ReadonlyArray<Pointer>;
}

export interface PasteCellsChange {
  ok: true;
  /** Parent array pointer. */
  path: Pointer;
  rows: number;
  cols: number;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
  /** Item pointers of the pasted rows, in order. */
  selectionAfter: ReadonlyArray<Pointer>;
}

export type PasteCellsResult = PasteCellsChange | PasteCellsError;

export interface PasteCells<TDocument> {
  canPasteGrid(target: PasteCellsTarget, matrix: ReadonlyArray<ReadonlyArray<unknown>>): PasteCellsResult;
  pasteGrid(target: PasteCellsTarget, matrix: ReadonlyArray<ReadonlyArray<unknown>>): PasteCellsResult;
}
