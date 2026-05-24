import {
  backEntry,
  canRedoMutable,
  canUndoMutable,
  forwardEntry,
  historyDepth,
  moveBack,
  moveForward,
  redoDepth,
} from "../../foundation/history.js";
import type { JSONDocumentHistory } from "./createJSONDocumentPublicTypes.js";
import {
  planDocumentActiveHistoryMetadata,
  planDocumentHistoryMergeLast,
  planDocumentHistoryMergeLastWrite,
  planDocumentTransactionCall,
  planDocumentTransactionScope,
} from "./createJSONDocumentMetadataPlan.js";
import {
  planDocumentTransactionMerge,
  planDocumentTransactionMergeRange,
  planDocumentTransactionMergeWrite,
} from "./createJSONDocumentTransactionPlan.js";
import {
  planDocumentHistoryRestore,
  planDocumentHistoryRestoreApply,
  planDocumentHistoryRestoreCompletion,
  planDocumentHistoryRestoreFlow,
} from "./createJSONDocumentHistoryPlan.js";
import type {
  DocumentHistoryRestoreCompletionPlan,
  DocumentTransactionCallPlan,
} from "./createJSONDocumentPlanTypes.js";
import type {
  DocumentHistoryRuntimeState,
  SelectionRuntimeAccess,
  TrustedDocumentStateOps,
} from "./createJSONDocumentRuntimeTypes.js";
import type { HistoryTransactionOptions } from "./stateOps.js";

export interface CreateDocumentHistoryRuntimeInput<T> {
  rawOps: TrustedDocumentStateOps<T>;
  historyState: DocumentHistoryRuntimeState;
  selection: SelectionRuntimeAccess;
  syncLastPatch: () => void;
}

export function createDocumentHistoryRuntime<T>(
  input: CreateDocumentHistoryRuntimeInput<T>,
): {
  history: JSONDocumentHistory;
  historyControls: {
    undo: () => boolean;
    redo: () => boolean;
    canUndo: () => boolean;
    canRedo: () => boolean;
  };
} {
  const { rawOps, historyState, selection, syncLastPatch } = input;

  const restore = (direction: "undo" | "redo"): boolean => {
    const flow = planDocumentHistoryRestoreFlow({ direction });
    const restoreStack = flow.entryStack === "undo" ? historyState.stack.undo : historyState.stack.redo;
    const entry = flow.entryStack === "undo" ? backEntry(historyState.stack) : forwardEntry(historyState.stack);
    if (!entry) return false;
    const plan = planDocumentHistoryRestore({
      direction,
      entry,
      currentState: rawOps.state,
      currentSelection: selection.snapSelection(),
    });
    if (flow.writeEntryPhase === "beforeApply") restoreStack[restoreStack.length - 1] = plan.entry;
    historyState.isRestoring = true;
    let completion: DocumentHistoryRestoreCompletionPlan | null = null;
    try {
      const applyPlan = planDocumentHistoryRestoreApply({ patch: plan.patch, state: plan.state });
      const r = applyPlan.kind === "patch"
        ? rawOps.applyTrustedPatch(applyPlan.patch)
        : rawOps.trustedApply(applyPlan.state as T, applyPlan.patch);
      completion = planDocumentHistoryRestoreCompletion({
        result: r,
        flow,
        entry: plan.entry,
        selectionAfter: plan.selectionAfter,
      });
      if (!completion.ok) return false;
      if (completion.writeEntryAfterApply !== null) restoreStack[restoreStack.length - 1] = completion.writeEntryAfterApply;
      if (completion.syncLastPatch) syncLastPatch();
    } catch {
      return false;
    } finally {
      historyState.isRestoring = false;
    }
    if (completion === null || !completion.ok) return false;
    if (completion.move === "back") moveBack(historyState.stack);
    else moveForward(historyState.stack);
    selection.restoreSelection(completion.selectionAfter);
    return true;
  };

  const historyControls = {
    undo: () => restore("undo"),
    redo: () => restore("redo"),
    canUndo: () => canUndoMutable(historyState.stack),
    canRedo: () => canRedoMutable(historyState.stack),
  };

  const mergeLast = (mergeOptions?: { mergeKey?: string }): boolean => {
    const merged = planDocumentHistoryMergeLast({
      isRestoring: historyState.isRestoring,
      historyDepth: historyDepth(historyState.stack),
      previous: historyState.stack.undo[historyState.stack.undo.length - 2],
      top: historyState.stack.undo[historyState.stack.undo.length - 1],
      ...(mergeOptions !== undefined ? { options: mergeOptions } : {}),
    });
    const write = planDocumentHistoryMergeLastWrite({ undoLength: historyState.stack.undo.length, merged });
    if (write.kind === "skip") return false;
    historyState.stack.undo[write.index] = write.entry;
    historyState.stack.undo.length = write.length;
    return true;
  };

  const mergeTransactionEntries = (depthBefore: number): void => {
    const range = planDocumentTransactionMergeRange({
      undoStart: historyState.stack.undoStart,
      undoLength: historyState.stack.undo.length,
      depthBefore,
      currentDepth: historyDepth(historyState.stack),
    });
    if (range === null) return;
    const merged = planDocumentTransactionMerge({ entries: historyState.stack.undo, start: range.start, end: range.end });
    const write = planDocumentTransactionMergeWrite({ range, merged });
    if (write.kind === "skip") return;
    historyState.stack.undo[write.index] = write.entry;
    historyState.stack.undo.length = write.length;
  };

  const withHistoryMetadata = (metadata: HistoryTransactionOptions | undefined, fn: () => void): void => {
    const previous = historyState.activeHistoryMetadata;
    historyState.activeHistoryMetadata = planDocumentActiveHistoryMetadata({ active: previous, next: metadata });
    try {
      fn();
    } finally {
      historyState.activeHistoryMetadata = previous;
    }
  };

  const transaction = (
    optionsOrFn: HistoryTransactionOptions | (() => void),
    maybeFn?: () => void,
  ): void => {
    const call: DocumentTransactionCallPlan = planDocumentTransactionCall({ optionsOrFn, maybeFn });
    if (call.kind === "skip") return;
    const depthBefore = historyDepth(historyState.stack);
    const scope = planDocumentTransactionScope({
      activeTransactionStartDepth: historyState.activeTransactionStartDepth,
      depthBefore,
    });
    historyState.activeTransactionStartDepth = scope.activeTransactionStartDepth;
    try {
      withHistoryMetadata(call.metadata, call.fn);
    } finally {
      historyState.activeTransactionStartDepth = scope.restoreTransactionStartDepth;
    }
    mergeTransactionEntries(depthBefore);
  };

  const history: JSONDocumentHistory = {
    get canUndo() { return historyControls.canUndo(); },
    get canRedo() { return historyControls.canRedo(); },
    get undoDepth() { return historyDepth(historyState.stack); },
    get redoDepth() { return redoDepth(historyState.stack); },
    undo: () => restore("undo"),
    redo: () => restore("redo"),
    mergeLast,
    transaction,
  };

  return { history, historyControls };
}
