// foundation/history — pure undo/redo stack reducer (P2.1).
// React 무관. createJSONDocument 가 이걸 wrapping 하고 useJSONDocument 는 그 facade 다.
//
// HistoryStack<E> 는 (undo, redo) 두 스택의 짝. E 는 entry 타입 (forward + inverse +
// 추가 메타데이터). selection snapshot 같은 ancillary 데이터는 entry 안에 사용자가
// 자유롭게 담는다 — foundation/history 는 entry 의 형태에 관여하지 않는다.

export interface HistoryStack<E> {
  readonly undo: ReadonlyArray<E>;
  readonly redo: ReadonlyArray<E>;
}

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

export interface MutableHistoryStack<E> {
  undo: E[];
  redo: E[];
  undoStart: number;
}

const UNDO_PREFIX_COMPACT_THRESHOLD = 8192;

export interface PlanMutableHistoryCommitInput {
  limit: number;
  undoLength: number;
  undoStart: number;
  redoLength: number;
}

export type MutableHistoryCommitPlan =
  | { kind: "skip" }
  | { kind: "replaceLatest"; clearRedo: boolean }
  | {
      kind: "append";
      undoStart: number;
      compactUndoPrefix: boolean;
      clearRedo: boolean;
    };

export interface PlanMutableHistoryMoveBackInput {
  undoLength: number;
  undoStart: number;
}

export type MutableHistoryMoveBackPlan =
  | { kind: "skip" }
  | { kind: "move"; resetUndoPrefix: boolean };

export interface PlanMutableHistoryMoveForwardInput {
  redoLength: number;
}

export type MutableHistoryMoveForwardPlan =
  | { kind: "skip" }
  | { kind: "move" };

export function emptyMutableHistory<E>(): MutableHistoryStack<E> {
  return { undo: [], redo: [], undoStart: 0 };
}

export function commitMutable<E>(stack: MutableHistoryStack<E>, entry: E, limit: number): void {
  const plan = planMutableHistoryCommit({
    limit,
    undoLength: stack.undo.length,
    undoStart: stack.undoStart,
    redoLength: stack.redo.length,
  });
  if (plan.kind === "skip") return;
  if (plan.kind === "replaceLatest") {
    stack.undo[0] = entry;
    stack.undo.length = 1;
    stack.undoStart = 0;
    if (plan.clearRedo) stack.redo.length = 0;
    return;
  }

  stack.undo.push(entry);
  stack.undoStart = plan.undoStart;
  if (plan.compactUndoPrefix) compactUndoPrefix(stack);
  if (plan.clearRedo) stack.redo.length = 0;
}

export function planMutableHistoryCommit(
  input: PlanMutableHistoryCommitInput,
): MutableHistoryCommitPlan {
  if (input.limit <= 0) return { kind: "skip" };
  if (input.limit === 1) {
    return {
      kind: "replaceLatest",
      clearRedo: input.redoLength !== 0,
    };
  }

  const undoLengthAfterAppend = input.undoLength + 1;
  const depthAfterAppend = undoLengthAfterAppend - input.undoStart;
  const undoStart = depthAfterAppend > input.limit
    ? input.undoStart + depthAfterAppend - input.limit
    : input.undoStart;
  return {
    kind: "append",
    undoStart,
    compactUndoPrefix: shouldCompactUndoPrefix({
      undoStart,
      undoLength: undoLengthAfterAppend,
    }),
    clearRedo: input.redoLength !== 0,
  };
}

export function backEntry<E>(stack: MutableHistoryStack<E>): E | null {
  return historyDepth(stack) === 0 ? null : stack.undo[stack.undo.length - 1]!;
}

export function forwardEntry<E>(stack: MutableHistoryStack<E>): E | null {
  return stack.redo.length === 0 ? null : stack.redo[stack.redo.length - 1]!;
}

export function moveBack<E>(stack: MutableHistoryStack<E>): void {
  const plan = planMutableHistoryMoveBack({
    undoLength: stack.undo.length,
    undoStart: stack.undoStart,
  });
  if (plan.kind === "skip") return;
  const entry = stack.undo.pop();
  if (entry !== undefined) stack.redo.push(entry);
  if (plan.resetUndoPrefix) {
    stack.undo.length = 0;
    stack.undoStart = 0;
  }
}

export function moveForward<E>(stack: MutableHistoryStack<E>): void {
  const plan = planMutableHistoryMoveForward({ redoLength: stack.redo.length });
  if (plan.kind === "skip") return;
  const entry = stack.redo.pop();
  if (entry !== undefined) stack.undo.push(entry);
}

export function planMutableHistoryMoveBack(
  input: PlanMutableHistoryMoveBackInput,
): MutableHistoryMoveBackPlan {
  if (input.undoLength - input.undoStart <= 0) return { kind: "skip" };
  return {
    kind: "move",
    resetUndoPrefix: input.undoLength - 1 === input.undoStart,
  };
}

export function planMutableHistoryMoveForward(
  input: PlanMutableHistoryMoveForwardInput,
): MutableHistoryMoveForwardPlan {
  return input.redoLength === 0 ? { kind: "skip" } : { kind: "move" };
}

export function mergeLastMutable<E>(
  stack: MutableHistoryStack<E>,
  merge: (prev: E, top: E) => E,
): boolean {
  if (historyDepth(stack) < 2) return false;
  const top = stack.undo[stack.undo.length - 1]!;
  const prev = stack.undo[stack.undo.length - 2]!;
  const merged = merge(prev, top);
  const mergeIndex = stack.undo.length - 2;
  stack.undo[mergeIndex] = merged;
  stack.undo.pop();
  return true;
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

export interface ShouldCompactUndoPrefixInput {
  undoStart: number;
  undoLength: number;
}

export function shouldCompactUndoPrefix(input: ShouldCompactUndoPrefixInput): boolean {
  if (input.undoStart === 0) return false;
  if (
    input.undoStart < UNDO_PREFIX_COMPACT_THRESHOLD
    && input.undoStart * 2 < input.undoLength
  ) {
    return false;
  }
  return true;
}

function compactUndoPrefix<E>(stack: MutableHistoryStack<E>): void {
  if (!shouldCompactUndoPrefix({
    undoStart: stack.undoStart,
    undoLength: stack.undo.length,
  })) return;
  stack.undo.splice(0, stack.undoStart);
  stack.undoStart = 0;
}
