import {
  backEntry,
  canRedoMutable,
  canUndoMutable,
  forwardEntry,
  historyDepth,
  moveBack,
  moveForward,
  redoDepth,
} from "../../../foundation/history.js";
import {
  planMergedDocumentHistoryEntry,
} from "./metadata.js";
import {
  planDocumentHistoryRestore,
} from "./restore.js";
import type {
  DocumentHistoryEntry,
  DocumentHistoryRuntimeState,
  JSONDocumentHistory,
} from "./types.js";
import type {
  SelectionRuntimeAccess,
  TrustedDocumentStateOps,
} from "../runtime/types.js";
import type { HistoryTransactionOptions } from "../runtime/types.js";

interface CreateDocumentHistoryRuntimeInput<T> {
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
    const restoreStack = direction === "undo" ? historyState.stack.undo : historyState.stack.redo;
    const entry = direction === "undo" ? backEntry(historyState.stack) : forwardEntry(historyState.stack);
    if (!entry) return false;
    const plan = planDocumentHistoryRestore({
      direction,
      entry,
      currentState: rawOps.state,
      currentSelection: selection.snapSelection(),
    });
    if (direction === "undo") restoreStack[restoreStack.length - 1] = plan.entry;
    historyState.isRestoring = true;
    try {
      const result = plan.state === undefined
        ? rawOps.applyTrustedPatch(plan.patch)
        : rawOps.trustedApply(plan.state as T, plan.patch);
      if (!result.ok) return false;
      if (direction === "redo") restoreStack[restoreStack.length - 1] = plan.entry;
      syncLastPatch();
    } catch {
      return false;
    } finally {
      historyState.isRestoring = false;
    }
    if (direction === "undo") moveBack(historyState.stack);
    else moveForward(historyState.stack);
    selection.restoreSelection(plan.selectionAfter);
    return true;
  };

  const historyControls = {
    undo: () => restore("undo"),
    redo: () => restore("redo"),
    canUndo: () => canUndoMutable(historyState.stack),
    canRedo: () => canRedoMutable(historyState.stack),
  };

  const mergeLast = (mergeOptions?: { mergeKey?: string }): boolean => {
    if (historyState.isRestoring || historyDepth(historyState.stack) < 2) return false;
    const undoLength = historyState.stack.undo.length;
    const previous = historyState.stack.undo[undoLength - 2];
    const top = historyState.stack.undo[undoLength - 1];
    if (previous === undefined || top === undefined) return false;
    historyState.stack.undo[undoLength - 2] = planMergedDocumentHistoryEntry(
      previous,
      top,
      mergeHistoryOptions(previous.metadata, top.metadata, mergeOptions),
    );
    historyState.stack.undo.length = undoLength - 1;
    return true;
  };

  const mergeTransactionEntries = (depthBefore: number): void => {
    if (historyDepth(historyState.stack) <= depthBefore + 1) return;
    const start = historyState.stack.undoStart + depthBefore;
    const end = historyState.stack.undo.length;
    if (start < historyState.stack.undoStart || end - start <= 1) return;
    const merged = mergeTransactionHistoryRange(historyState.stack.undo, start, end);
    if (merged === null) return;
    historyState.stack.undo[start] = merged;
    historyState.stack.undo.length = start + 1;
  };

  const withHistoryMetadata = (metadata: HistoryTransactionOptions | undefined, fn: () => void): void => {
    const previous = historyState.activeHistoryMetadata;
    historyState.activeHistoryMetadata = metadata === undefined ? previous : { ...previous, ...metadata };
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
    const fn = typeof optionsOrFn === "function" ? optionsOrFn : maybeFn;
    if (fn === undefined) return;
    const metadata = typeof optionsOrFn === "function" ? undefined : optionsOrFn;
    const depthBefore = historyDepth(historyState.stack);
    const previousTransactionStartDepth = historyState.activeTransactionStartDepth;
    historyState.activeTransactionStartDepth = previousTransactionStartDepth ?? depthBefore;
    try {
      withHistoryMetadata(metadata, fn);
    } finally {
      historyState.activeTransactionStartDepth = previousTransactionStartDepth;
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

function mergeTransactionHistoryRange(
  entries: ReadonlyArray<DocumentHistoryEntry>,
  start: number,
  end: number,
): DocumentHistoryEntry | null {
  let merged = entries[start];
  if (merged === undefined) return null;

  for (let index = start + 1; index < end; index += 1) {
    const entry = entries[index];
    if (entry === undefined) return null;
    merged = planMergedDocumentHistoryEntry(
      merged,
      entry,
      mergeHistoryOptions(merged.metadata, entry.metadata, undefined),
    );
  }
  return merged;
}

function mergeHistoryOptions(
  previous: HistoryTransactionOptions | undefined,
  next: HistoryTransactionOptions | undefined,
  options: { mergeKey?: string } | undefined,
): HistoryTransactionOptions | undefined {
  if (previous === undefined && next === undefined && options === undefined) return undefined;
  const merged = { ...previous, ...next, ...options };
  return Object.keys(merged).length > 0 ? merged : undefined;
}
