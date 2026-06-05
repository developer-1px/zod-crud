import type { JSONPatchOperation, JSONResult } from "../../../foundation/patch/types.js";
import type { Pointer } from "../../../foundation/pointer/index.js";
import type { JSONChangeMetadata } from "../history/types.js";

export type JSONPatchInput = JSONPatchOperation | ReadonlyArray<JSONPatchOperation>;

export interface JSONStateOps<T> {
  add(path: Pointer, value: unknown): JSONResult;
  remove(path: Pointer): JSONResult;
  replace(path: Pointer, value: unknown): JSONResult;
  move(from: Pointer, path: Pointer): JSONResult;
  copy(from: Pointer, path: Pointer): JSONResult;
  test(path: Pointer, value: unknown): JSONResult;

  patch(operations: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;

  load(value: unknown, options?: { preserveHistory?: boolean }): JSONResult;
  reset(value?: unknown): JSONResult;

  subscribe(listener: (
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ) => void): () => void;
  readonly state: T;
}

export interface TrustedDocumentStateOps<T> extends JSONStateOps<T> {
  readonly lastApplied: ReadonlyArray<JSONPatchOperation>;
  readonly state: T;
  readonly stateJsonTrusted: boolean;
  patch(operations: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;
  previewPatch(operations: ReadonlyArray<JSONPatchOperation>): {
    result: JSONResult;
    state: T;
    applied: ReadonlyArray<JSONPatchOperation>;
  };
  previewTrustedValuesPatch(operations: ReadonlyArray<JSONPatchOperation>): {
    result: JSONResult;
    state: T;
    applied: ReadonlyArray<JSONPatchOperation>;
  };
  applyTrustedPatch(operations: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;
  trustedApply(state: T, applied: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;
}

export interface DocumentPatchRuntimeState {
  lastPatch: ReadonlyArray<JSONPatchOperation>;
  documentSubscriberCount: number;
}
