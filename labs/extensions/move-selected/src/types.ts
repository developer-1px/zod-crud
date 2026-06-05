import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "zod-crud";

export type MoveSelectedErrorCode =
  | "empty_selection"
  | "invalid_pointer"
  | "not_array_item"
  | "mixed_parent"
  | "not_contiguous"
  | "path_not_found"
  | "not_array"
  | "target_parent_mismatch"
  | "target_in_selection"
  | "patch_rejected"
  | "patch_failed";

export interface MoveSelectedError {
  ok: false;
  code: MoveSelectedErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

/** Move the selected block to just before or just after a reference sibling. */
export type MoveSelectedTarget =
  | { before: Pointer }
  | { after: Pointer };

export interface MoveSelectedChange {
  ok: true;
  /** Parent array pointer. */
  path: Pointer;
  count: number;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
  /** Item pointers of the moved block at its new position, in order. */
  selectionAfter: ReadonlyArray<Pointer>;
}

export type MoveSelectedResult = MoveSelectedChange | MoveSelectedError;

export interface MoveSelected<TDocument> {
  canMoveSelected(source: ReadonlyArray<Pointer>, target: MoveSelectedTarget): MoveSelectedResult;
  moveSelected(source: ReadonlyArray<Pointer>, target: MoveSelectedTarget): MoveSelectedResult;
}

export interface NormalizedRange {
  ok: true;
  parent: Pointer;
  indices: number[];
}
