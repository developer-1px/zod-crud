import type {
  JSONCapabilityResult,
  JSONDocumentDuplicateOptions,
  JSONDocumentDuplicateResult,
  JSONResult,
  Pointer,
} from "@interactive-os/json-document";

export type CollectionErrorCode =
  | "empty_selection"
  | "invalid_pointer"
  | "path_not_found"
  | "not_collection_item"
  | "move_boundary";

export interface CollectionError {
  ok: false;
  code: CollectionErrorCode;
  reason: string;
  pointer?: Pointer;
}

export type CollectionCapabilityResult =
  | { ok: true }
  | CollectionError
  | Exclude<JSONCapabilityResult, { ok: true }>;

export type CollectionEditResult =
  | JSONResult
  | CollectionError
  | Exclude<JSONCapabilityResult, { ok: true }>;

export type CollectionDuplicateResult<T> =
  | JSONDocumentDuplicateResult<T>
  | CollectionError;

export type CollectionSource = Pointer | ReadonlyArray<Pointer>;

export interface CollectionDuplicateOptions {
  rekey?: JSONDocumentDuplicateOptions["rekey"];
}

export interface Collection<T> {
  canMoveUp(pointer: Pointer): CollectionCapabilityResult;
  moveUp(pointer: Pointer): CollectionEditResult;
  canMoveDown(pointer: Pointer): CollectionCapabilityResult;
  moveDown(pointer: Pointer): CollectionEditResult;
  canMoveBefore(source: Pointer, target: Pointer): CollectionCapabilityResult;
  moveBefore(source: Pointer, target: Pointer): CollectionEditResult;
  canMoveAfter(source: Pointer, target: Pointer): CollectionCapabilityResult;
  moveAfter(source: Pointer, target: Pointer): CollectionEditResult;
  canDuplicateAfter(pointer: Pointer, options?: CollectionDuplicateOptions): CollectionCapabilityResult;
  duplicateAfter(pointer: Pointer, options?: CollectionDuplicateOptions): CollectionDuplicateResult<T>;
  canDeleteItems(source: CollectionSource): CollectionCapabilityResult;
  deleteItems(source: CollectionSource): CollectionEditResult;
}

export interface CollectionItemLocation {
  pointer: Pointer;
  parent: Pointer;
  index: number;
  length: number;
}

export type CollectionItemLocationResult =
  | { ok: true; location: CollectionItemLocation }
  | CollectionError;

export type CollectionMovePlan =
  | { ok: true; from: Pointer; path: Pointer; noop: boolean }
  | CollectionError;

export type NormalizedCollectionSource =
  | { ok: true; sources: Pointer[] }
  | CollectionError;
