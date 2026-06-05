import { emptyMutableHistory } from "../../../foundation/history.js";
import type { DocumentHistoryRuntimeState } from "./types.js";

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
