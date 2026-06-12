import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "@interactive-os/json-document";

export type SortItemsErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_collection"
  | "compare_failed"
  | "patch_rejected"
  | "patch_failed";

export interface SortItemsError {
  ok: false;
  code: SortItemsErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface SortItemsItem<TValue = unknown> {
  pointer: Pointer;
  value: TValue;
  index: number;
}

export type SortItemsCompare<TValue = unknown> = (
  left: SortItemsItem<TValue>,
  right: SortItemsItem<TValue>,
) => number;

export interface SortItemsChange<TValue = unknown> {
  ok: true;
  path: Pointer;
  count: number;
  changed: boolean;
  values: ReadonlyArray<TValue>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type SortItemsChangeResult<TValue = unknown> =
  | SortItemsChange<TValue>
  | SortItemsError;

export type SortItemsResult<TValue = unknown> =
  | SortItemsChange<TValue>
  | SortItemsError;

export interface SortItems<TDocument> {
  canSort<TValue = unknown>(
    path: Pointer,
    compare: SortItemsCompare<TValue>,
  ): SortItemsChangeResult<TValue>;
  sort<TValue = unknown>(
    path: Pointer,
    compare: SortItemsCompare<TValue>,
  ): SortItemsResult<TValue>;
  canReverse<TValue = unknown>(path: Pointer): SortItemsChangeResult<TValue>;
  reverse<TValue = unknown>(path: Pointer): SortItemsResult<TValue>;
}

export interface CollectionReadOk<TValue> {
  ok: true;
  path: Pointer;
  values: TValue[];
}

export type CollectionReadResult<TValue> = CollectionReadOk<TValue> | SortItemsError;
