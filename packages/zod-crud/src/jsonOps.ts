// jsonOps — boundary type. hooks (producer: useJson) ↔ commands (consumer: buildCommands)
// 사이의 contract. neutral 위치 (특정 layer 에 속하지 않는 boundary type).
//
// JsonOps<T>: useJson 의 return 표면. RFC 6902 6 op + history + lifecycle + pub/sub.
// commands/buildCommands 가 이 type 을 받아 verbs/* 합성을 wiring.

import type { JsonPatchOperation, JsonResult } from "./core/patch/index.js";
import type { PointerOf, ValueAt } from "./core/pointer/types.js";
import type { JsonCrudError } from "./JsonCrudError.js";

export interface UseJsonOptions {
  strict?: boolean;
  onError?: (error: JsonCrudError) => void;
}

export type JsonChangeListener = (applied: ReadonlyArray<JsonPatchOperation>) => void;

// Internal — history controls. Public surface 은 doc.commands.undo / doc.can.undo / doc.history.
// buildJsonDocumentOps 가 wrapping 한 ops 에만 존재. JsonOps (외부) 표면에는 노출하지 않는다.
export interface HistoryControls {
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
}

export type JsonDocumentOps<T> = JsonOps<T> & HistoryControls;

export interface JsonOps<T> {
  add<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JsonResult;
  remove<P extends PointerOf<T>>(path: P): JsonResult;
  replace<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JsonResult;
  move<F extends PointerOf<T>, P extends PointerOf<T>>(from: F, path: P): JsonResult;
  copy<F extends PointerOf<T>, P extends PointerOf<T>>(from: F, path: P): JsonResult;
  test<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JsonResult;

  patch(operations: ReadonlyArray<JsonPatchOperation>): JsonResult;

  load(value: T): JsonResult;
  reset(value?: T): void;

  subscribe(listener: JsonChangeListener): () => void;
  readonly state: T;
}
