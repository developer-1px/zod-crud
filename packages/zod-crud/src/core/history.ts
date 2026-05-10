// core/history — pure undo/redo stack reducer (P2.1).
// React 무관. useJsonDocument 가 이걸 wrapping 한다 (P2.2).
//
// HistoryStack<E> 는 (undo, redo) 두 스택의 짝. E 는 entry 타입 (forward + inverse +
// 추가 메타데이터). selection snapshot 같은 ancillary 데이터는 entry 안에 사용자가
// 자유롭게 담는다 — core/history 는 entry 의 형태에 관여하지 않는다.

export interface HistoryStack<E> {
  readonly undo: ReadonlyArray<E>;
  readonly redo: ReadonlyArray<E>;
}

export const EMPTY_HISTORY: HistoryStack<never> = { undo: [], redo: [] };

export function emptyHistory<E>(): HistoryStack<E> {
  return { undo: [], redo: [] };
}

/** 새 entry 를 commit. redo 는 비워진다. limit 초과 시 가장 오래된 항목 제거. */
export function commit<E>(stack: HistoryStack<E>, entry: E, limit: number): HistoryStack<E> {
  if (limit <= 0) return stack;
  const next = [...stack.undo, entry];
  if (next.length > limit) next.shift();
  return { undo: next, redo: [] };
}

/** undo top 을 pop. 없으면 null. */
export function back<E>(stack: HistoryStack<E>): { entry: E; next: HistoryStack<E> } | null {
  if (stack.undo.length === 0) return null;
  const entry = stack.undo[stack.undo.length - 1]!;
  return {
    entry,
    next: { undo: stack.undo.slice(0, -1), redo: [...stack.redo, entry] },
  };
}

/** redo top 을 pop. 없으면 null. */
export function forward<E>(stack: HistoryStack<E>): { entry: E; next: HistoryStack<E> } | null {
  if (stack.redo.length === 0) return null;
  const entry = stack.redo[stack.redo.length - 1]!;
  return {
    entry,
    next: { undo: [...stack.undo, entry], redo: stack.redo.slice(0, -1) },
  };
}

/** 마지막 두 entry 를 합친다. merge 함수가 두 entry 를 한 entry 로 합치는 책임. */
export function mergeLast<E>(
  stack: HistoryStack<E>,
  merge: (prev: E, top: E) => E,
): HistoryStack<E> | null {
  if (stack.undo.length < 2) return null;
  const top = stack.undo[stack.undo.length - 1]!;
  const prev = stack.undo[stack.undo.length - 2]!;
  const merged = merge(prev, top);
  return {
    undo: [...stack.undo.slice(0, -2), merged],
    redo: stack.redo,
  };
}

export function canUndo<E>(stack: HistoryStack<E>): boolean {
  return stack.undo.length > 0;
}

export function canRedo<E>(stack: HistoryStack<E>): boolean {
  return stack.redo.length > 0;
}
