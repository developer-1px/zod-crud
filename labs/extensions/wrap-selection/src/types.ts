import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "@interactive-os/json-document";

export type WrapSource = Pointer | ReadonlyArray<Pointer>;

export type WrapSelectionOperation = "wrap" | "unwrap";

export type WrapSelectionErrorCode =
  | "empty_selection"
  | "invalid_pointer"
  | "path_not_found"
  | "not_array_item"
  | "mixed_parent"
  | "non_contiguous_selection"
  | "not_wrapper"
  | "empty_wrapper"
  | "wrapper_factory_failed"
  | "patch_rejected"
  | "patch_failed";

export interface WrapCreateContext {
  parent: Pointer;
  insertIndex: number;
  source: ReadonlyArray<Pointer>;
}

export interface WrapSelectionAdapter {
  isWrapper(value: unknown): boolean;
  getChildren(value: unknown): ReadonlyArray<unknown> | null;
  createWrapper(children: ReadonlyArray<unknown>, context: WrapCreateContext): unknown;
}

export interface WrapSelectionError {
  ok: false;
  code: WrapSelectionErrorCode;
  reason: string;
  operation?: WrapSelectionOperation;
  pointer?: Pointer;
  parent?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<JSONResult, { ok: true }>;
}

export interface WrapSelectionChange {
  ok: true;
  operation: WrapSelectionOperation;
  parent: Pointer;
  source: ReadonlyArray<Pointer>;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionAfter: ReadonlyArray<Pointer>;
}

export type WrapSelectionChangeResult = WrapSelectionChange | WrapSelectionError;

export type WrapSelectionApplyResult =
  | (WrapSelectionChange & { result: JSONResult })
  | WrapSelectionError;

export interface WrapSelection<TDocument> {
  canWrap(source: WrapSource): WrapSelectionChangeResult;
  wrap(source: WrapSource): WrapSelectionApplyResult;
  canUnwrap(source: Pointer): WrapSelectionChangeResult;
  unwrap(source: Pointer): WrapSelectionApplyResult;
}

export interface ItemLocation {
  pointer: Pointer;
  parent: Pointer;
  index: number;
  value: unknown;
}

export interface WrapSelectionPlan {
  operation: WrapSelectionOperation;
  parent: Pointer;
  source: ReadonlyArray<Pointer>;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionAfter: ReadonlyArray<Pointer>;
}
