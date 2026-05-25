import type { JSONPatchOperation, JSONResult } from "../../foundation/json-patch/index.js";
import type { SelectionSnap } from "../../domain/selection/index.js";
import type { MutableHistoryStack } from "../../foundation/history.js";
import type { DocumentHistoryEntry } from "./createJSONDocumentHistoryTypes.js";
import type { JSONChangeMetadata, JSONStateOps } from "./stateOps.js";

export type HistoryEntry = DocumentHistoryEntry;

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
  test(path: string, value: unknown): JSONResult;
  load(value: T): JSONResult;
  reset(value?: T): JSONResult;
  subscribe(listener: (
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ) => void): () => void;
}

export interface DocumentHistoryRuntimeState {
  stack: MutableHistoryStack<HistoryEntry>;
  isRestoring: boolean;
  activeHistoryMetadata: import("./stateOps.js").HistoryTransactionOptions | undefined;
  activeTransactionStartDepth: number | undefined;
}

export interface DocumentPatchRuntimeState {
  lastPatch: ReadonlyArray<JSONPatchOperation>;
  documentSubscriberCount: number;
}

export interface SelectionRuntimeAccess {
  selectionEnabled: boolean;
  selectionMode: import("../../domain/selection/index.js").SelectionMode;
  snapSelection: () => SelectionSnap;
  restoreSelection: (selection: SelectionSnap) => void;
}
