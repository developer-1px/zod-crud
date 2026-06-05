import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "zod-crud";

export type RenumberItemsErrorCode =
  | "invalid_pointer"
  | "invalid_field"
  | "path_not_found"
  | "not_array"
  | "patch_rejected"
  | "patch_failed";

export interface RenumberItemsError {
  ok: false;
  code: RenumberItemsErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface RenumberItemsOptions {
  /** Relative field written on each item, e.g. `"/position"`. Default `"/order"`. */
  field?: Pointer;
  /** First index value. Default `0`. */
  start?: number;
  /** Increment between consecutive items. Default `1`. */
  step?: number;
}

export interface RenumberItemsChange {
  ok: true;
  path: Pointer;
  field: Pointer;
  count: number;
  /** Number of items whose order field changed. */
  changedCount: number;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type RenumberItemsResult = RenumberItemsChange | RenumberItemsError;

export interface RenumberItems<TDocument> {
  canRenumberItems(path: Pointer, options?: RenumberItemsOptions): RenumberItemsResult;
  renumberItems(path: Pointer, options?: RenumberItemsOptions): RenumberItemsResult;
}
