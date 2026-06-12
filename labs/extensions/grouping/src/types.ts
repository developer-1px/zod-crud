import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "@interactive-os/json-document";

export type GroupingSource = Pointer | ReadonlyArray<Pointer>;

export type GroupingOperation = "group" | "ungroup";

export type GroupingErrorCode =
  | "empty_selection"
  | "too_few_items"
  | "invalid_pointer"
  | "path_not_found"
  | "not_array_item"
  | "mixed_parent"
  | "non_contiguous_selection"
  | "not_group"
  | "empty_group"
  | "group_factory_failed"
  | "patch_rejected"
  | "patch_failed";

export interface GroupingCreateContext {
  parent: Pointer;
  insertIndex: number;
  source: ReadonlyArray<Pointer>;
}

export interface GroupingAdapter {
  isGroup(value: unknown): boolean;
  getChildren(value: unknown): ReadonlyArray<unknown> | null;
  createGroup(children: ReadonlyArray<unknown>, context: GroupingCreateContext): unknown;
}

export interface GroupingError {
  ok: false;
  code: GroupingErrorCode;
  reason: string;
  operation?: GroupingOperation;
  pointer?: Pointer;
  parent?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<JSONResult, { ok: true }>;
}

export interface GroupingChange {
  ok: true;
  operation: GroupingOperation;
  parent: Pointer;
  source: ReadonlyArray<Pointer>;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionAfter: ReadonlyArray<Pointer>;
}

export type GroupingChangeResult = GroupingChange | GroupingError;

export type GroupingApplyResult =
  | (GroupingChange & { result: JSONResult })
  | GroupingError;

export interface Grouping<TDocument> {
  canGroup(source: GroupingSource): GroupingChangeResult;
  group(source: GroupingSource): GroupingApplyResult;
  canUngroup(source: Pointer): GroupingChangeResult;
  ungroup(source: Pointer): GroupingApplyResult;
}

export interface ItemLocation {
  pointer: Pointer;
  parent: Pointer;
  index: number;
  value: unknown;
}

export interface GroupingPlan {
  operation: GroupingOperation;
  parent: Pointer;
  source: ReadonlyArray<Pointer>;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionAfter: ReadonlyArray<Pointer>;
}
