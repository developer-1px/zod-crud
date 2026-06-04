import type { SelectionSnap } from "../../../domain/selection/types.js";
import type { MutableHistoryStack } from "../../../foundation/history.js";
import type { JSONPatchOperation } from "../../../foundation/patch/types.js";
import type { HistoryTransactionOptions } from "../runtime/types.js";

export interface JSONDocumentHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
  undo(): boolean;
  redo(): boolean;
  mergeLast(options?: { mergeKey?: string }): boolean;
  transaction(fn: () => void): void;
  transaction(options: HistoryTransactionOptions, fn: () => void): void;
}

export interface DocumentHistoryEntry {
  forward: JSONPatchOperation[];
  inverse: JSONPatchOperation[];
  selectionBefore: SelectionSnap;
  selectionAfter: SelectionSnap;
  metadata?: HistoryTransactionOptions;
  snapshot?: {
    before: unknown;
    after?: unknown;
  };
}

export interface DocumentHistoryRuntimeState {
  stack: MutableHistoryStack<DocumentHistoryEntry>;
  isRestoring: boolean;
  activeHistoryMetadata: HistoryTransactionOptions | undefined;
  activeTransactionStartDepth: number | undefined;
}

export interface DocumentHistoryRestorePlan {
  patch: ReadonlyArray<JSONPatchOperation>;
  selectionAfter: SelectionSnap;
  entry: DocumentHistoryEntry;
  state?: unknown;
}
