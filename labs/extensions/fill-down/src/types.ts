import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "@interactive-os/json-document";

export type FillDownErrorCode =
  | "invalid_pointer"
  | "invalid_field"
  | "path_not_found"
  | "not_array"
  | "patch_rejected"
  | "patch_failed";

export interface FillDownError {
  ok: false;
  code: FillDownErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface FillDownOptions {
  /** Relative field carried per item, e.g. `"/value"`. Default `""` (whole item). */
  field?: Pointer;
  /** `"down"` carries the previous non-empty value forward (default); `"up"` carries the next one back. */
  direction?: "down" | "up";
  /** Decide whether a value counts as empty (gets filled). Default: null, undefined, or "". */
  isEmpty?: (value: unknown) => boolean;
}

export interface FillDownChange {
  ok: true;
  path: Pointer;
  field: Pointer;
  /** Number of empty slots filled from a neighbor. */
  filled: number;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type FillDownResult = FillDownChange | FillDownError;

export interface FillDown<TDocument> {
  canFillDown(path: Pointer, options?: FillDownOptions): FillDownResult;
  fillDown(path: Pointer, options?: FillDownOptions): FillDownResult;
}
