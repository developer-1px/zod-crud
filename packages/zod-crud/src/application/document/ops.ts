// jsonOps — internal boundary type. Low-level state producers and document
// feature modules share this contract without exposing it as public API.
//
// JSONOps<T>: low-level JSON operation 표면. RFC 6902 6 op + lifecycle + pub/sub.

import type { JSONPatchOperation, JSONResult } from "../../foundation/json-patch/index.js";
import type { SelectionSnap } from "../../domain/selection/index.js";
import type { PointerOf, ValueAt } from "../../foundation/json-pointer/types.js";

export interface HistoryTransactionOptions {
  label?: string;
  origin?: "keyboard" | "pointer" | "programmatic" | string;
  mergeKey?: string;
}

export interface JSONChangeMetadata extends HistoryTransactionOptions {
  selectionBefore?: SelectionSnap;
  selectionAfter?: SelectionSnap;
}

export interface JSONOps<T> {
  add<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JSONResult;
  remove<P extends PointerOf<T>>(path: P): JSONResult;
  replace<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JSONResult;
  move<F extends PointerOf<T>, P extends PointerOf<T>>(from: F, path: P): JSONResult;
  copy<F extends PointerOf<T>, P extends PointerOf<T>>(from: F, path: P): JSONResult;
  test<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JSONResult;

  patch(operations: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;

  load(value: T, options?: { preserveHistory?: boolean }): JSONResult;
  reset(value?: T): JSONResult;

  subscribe(listener: (
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ) => void): () => void;
  readonly state: T;
}
