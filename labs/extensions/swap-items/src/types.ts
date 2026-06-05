import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "zod-crud";

export type SwapItemsErrorCode =
  | "invalid_pointer"
  | "not_array_item"
  | "mixed_parent"
  | "path_not_found"
  | "not_array"
  | "index_out_of_range"
  | "patch_rejected"
  | "patch_failed";

export interface SwapItemsError {
  ok: false;
  code: SwapItemsErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface SwapItemsChange {
  ok: true;
  /** Parent array pointer. */
  path: Pointer;
  a: Pointer;
  b: Pointer;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type SwapItemsResult = SwapItemsChange | SwapItemsError;

export interface SwapItems<TDocument> {
  canSwapItems(a: Pointer, b: Pointer): SwapItemsResult;
  swapItems(a: Pointer, b: Pointer): SwapItemsResult;
}

export interface Located {
  ok: true;
  parent: Pointer;
  index: number;
}
