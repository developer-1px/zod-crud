// JSONStateOps — internal boundary type. Low-level state producers and document
// feature modules share this contract without exposing it as public API.
//
// JSONStateOps<T>: low-level JSON operation 표면. RFC 6902 6 op + lifecycle + pub/sub.

import type { JSONPatchOperation, JSONResult } from "../../foundation/json-patch/types.js";
import type { Pointer } from "../../foundation/json-pointer/pointerCore.js";
import type { SelectionSnap } from "../../domain/selection/selectionTypes.js";

export interface HistoryTransactionOptions {
  label?: string;
  origin?: "keyboard" | "pointer" | "programmatic" | string;
  mergeKey?: string;
}

export interface JSONChangeMetadata extends HistoryTransactionOptions {
  selectionBefore?: SelectionSnap;
  selectionAfter?: SelectionSnap;
}

export interface JSONStateOps<T> {
  add(path: Pointer, value: unknown): JSONResult;
  remove(path: Pointer): JSONResult;
  replace(path: Pointer, value: unknown): JSONResult;
  move(from: Pointer, path: Pointer): JSONResult;
  copy(from: Pointer, path: Pointer): JSONResult;
  test(path: Pointer, value: unknown): JSONResult;

  patch(operations: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;

  load(value: T, options?: { preserveHistory?: boolean }): JSONResult;
  reset(value?: T): JSONResult;

  subscribe(listener: (
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ) => void): () => void;
  readonly state: T;
}
