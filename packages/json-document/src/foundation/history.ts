// foundation/history — mutable undo/redo stack for document history.

export interface MutableHistoryStack<E> {
  undo: E[];
  redo: E[];
  undoStart: number;
}

const UNDO_PREFIX_COMPACT_THRESHOLD = 8192;

export function emptyMutableHistory<E>(): MutableHistoryStack<E> {
  return { undo: [], redo: [], undoStart: 0 };
}

export function commitMutable<E>(stack: MutableHistoryStack<E>, entry: E, limit: number): void {
  if (limit <= 0) return;
  if (limit === 1) {
    stack.undo[0] = entry;
    stack.undo.length = 1;
    stack.undoStart = 0;
    stack.redo.length = 0;
    return;
  }

  stack.undo.push(entry);
  const depth = stack.undo.length - stack.undoStart;
  if (depth > limit) stack.undoStart += depth - limit;
  compactUndoPrefix(stack);
  stack.redo.length = 0;
}

export function backEntry<E>(stack: MutableHistoryStack<E>): E | null {
  return historyDepth(stack) === 0 ? null : stack.undo[stack.undo.length - 1]!;
}

export function forwardEntry<E>(stack: MutableHistoryStack<E>): E | null {
  return stack.redo.length === 0 ? null : stack.redo[stack.redo.length - 1]!;
}

export function moveBack<E>(stack: MutableHistoryStack<E>): void {
  if (historyDepth(stack) <= 0) return;
  const resetUndoPrefix = stack.undo.length - 1 === stack.undoStart;
  const entry = stack.undo.pop();
  if (entry !== undefined) stack.redo.push(entry);
  if (resetUndoPrefix) {
    stack.undo.length = 0;
    stack.undoStart = 0;
  }
}

export function moveForward<E>(stack: MutableHistoryStack<E>): void {
  const entry = stack.redo.pop();
  if (entry !== undefined) stack.undo.push(entry);
}

export function historyDepth<E>(stack: MutableHistoryStack<E>): number {
  return stack.undo.length - stack.undoStart;
}

export function redoDepth<E>(stack: MutableHistoryStack<E>): number {
  return stack.redo.length;
}

export function canUndoMutable<E>(stack: MutableHistoryStack<E>): boolean {
  return historyDepth(stack) > 0;
}

export function canRedoMutable<E>(stack: MutableHistoryStack<E>): boolean {
  return stack.redo.length > 0;
}

function compactUndoPrefix<E>(stack: MutableHistoryStack<E>): void {
  if (stack.undoStart === 0) return;
  if (
    stack.undoStart < UNDO_PREFIX_COMPACT_THRESHOLD
    && stack.undoStart * 2 < stack.undo.length
  ) {
    return;
  }
  stack.undo.splice(0, stack.undoStart);
  stack.undoStart = 0;
}
