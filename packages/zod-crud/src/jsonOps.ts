// jsonOps — boundary type. Internal state/document producers and command
// builders consumers 사이의 contract. neutral 위치 (특정 layer 에 속하지 않는 boundary type).
//
// JSONOps<T>: low-level JSON operation 표면. RFC 6902 6 op + lifecycle + pub/sub.
// commands/buildCommands 가 이 type 을 받아 verbs/* 합성을 wiring.

import type { JSONPatchOperation, JSONResult } from "./core/patch/index.js";
import type { SelectionSnap } from "./core/selection/index.js";
import type { PointerOf, ValueAt } from "./core/pointer/types.js";
import type { JSONCrudError } from "./JSONCrudError.js";

export interface JSONRuntimeOptions {
  strict?: boolean | undefined;
  onError?: (error: JSONCrudError) => void;
}

export interface HistoryTransactionOptions {
  label?: string;
  origin?: "keyboard" | "pointer" | "programmatic" | string;
  mergeKey?: string;
}

export interface HistoryMergeOptions {
  mergeKey?: string;
}

export interface JSONChangeMetadata extends HistoryTransactionOptions {
  selectionBefore?: SelectionSnap;
  selectionAfter?: SelectionSnap;
}

export type JSONChangeListener = (
  applied: ReadonlyArray<JSONPatchOperation>,
  metadata?: JSONChangeMetadata,
) => void;

export interface JSONLoadOptions {
  /** Keep useJSONDocument history instead of treating load as a hard reset. */
  preserveHistory?: boolean;
}

export interface JSONOps<T> {
  add<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JSONResult;
  remove<P extends PointerOf<T>>(path: P): JSONResult;
  replace<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JSONResult;
  move<F extends PointerOf<T>, P extends PointerOf<T>>(from: F, path: P): JSONResult;
  copy<F extends PointerOf<T>, P extends PointerOf<T>>(from: F, path: P): JSONResult;
  test<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JSONResult;

  patch(operations: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;

  load(value: T, options?: JSONLoadOptions): JSONResult;
  reset(value?: T): JSONResult;

  subscribe(listener: JSONChangeListener): () => void;
  readonly state: T;
}
