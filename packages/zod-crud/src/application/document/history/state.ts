import { emptyMutableHistory, type MutableHistoryStack } from "../../../foundation/history.js";
import type { DocumentHistoryEntry } from "./entry.js";
import type { HistoryTransactionOptions } from "./metadata.js";

export interface DocumentHistoryRuntimeState {
  stack: MutableHistoryStack<DocumentHistoryEntry>;
  isRestoring: boolean;
  activeHistoryMetadata: HistoryTransactionOptions | undefined;
  activeTransactionStartDepth: number | undefined;
}

export function createDocumentHistoryRuntimeState(): DocumentHistoryRuntimeState {
  return {
    stack: emptyMutableHistory(),
    isRestoring: false,
    activeHistoryMetadata: undefined,
    activeTransactionStartDepth: undefined,
  };
}

export function resetDocumentHistoryRuntimeState(state: DocumentHistoryRuntimeState): void {
  state.stack = emptyMutableHistory();
}
