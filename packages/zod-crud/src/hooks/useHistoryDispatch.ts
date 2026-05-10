// History stack + dispatch with 500ms coalescing.
// useJson 내부 전용 — 같은 시간 창의 입력을 한 undo entry 로 합친다.

import { useCallback, useRef } from "react";
import type * as z from "zod";

import { applyPatch, computeInverses, type JsonPatchOperation, type JsonResult } from "../core/patch/index.js";
import { handleResult, type ErrorPolicy, type JsonCrudOpLabel } from "./JsonCrudError.js";

const COALESCE_MS = 500;

interface HistoryEntry {
  forward: JsonPatchOperation[];
  inverse: JsonPatchOperation[];
}

export interface HistoryDispatch<T> {
  dispatch(label: JsonPatchOperation | "patch", ops: ReadonlyArray<JsonPatchOperation>): { result: JsonResult; applied: ReadonlyArray<JsonPatchOperation> };
  /** undo/redo 실행 — applied ops 를 반환 (notify 용). 실패 시 null. */
  applyEntry(direction: "undo" | "redo"): { next: T; applied: ReadonlyArray<JsonPatchOperation> } | null;
  canUndo(): boolean;
  canRedo(): boolean;
  /** load/reset 시 history 초기화. */
  clear(): void;
}

export function useHistoryDispatch<S extends z.ZodType>(
  schema: S,
  stateRef: React.MutableRefObject<z.output<S>>,
  setState: (next: z.output<S>) => void,
  policyRef: React.MutableRefObject<ErrorPolicy>,
  historyLimit: number,
): HistoryDispatch<z.output<S>> {
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const lastDispatchAtRef = useRef<number>(0);

  const dispatch = useCallback(
    (label: JsonPatchOperation | "patch", ops: ReadonlyArray<JsonPatchOperation>) => {
      const before = stateRef.current;
      const { state: next, result, applied } = applyPatch(schema, before, ops);
      if (!result.ok) return { result: handleResult(policyRef.current, label as JsonCrudOpLabel, result), applied };
      if (next === before) return { result, applied };

      if (historyLimit > 0) {
        const inv = computeInverses(before, applied);
        if (inv.ok) {
          const stack = undoStackRef.current;
          const now = Date.now();
          const last = stack[stack.length - 1];
          // 같은 시간 창 안의 입력은 직전 entry 에 합친다 — 빠른 타이핑 = 1 undo.
          if (last && now - lastDispatchAtRef.current < COALESCE_MS) {
            last.forward.push(...applied);
            last.inverse.unshift(...inv.inverses);
          } else {
            stack.push({ forward: [...applied], inverse: inv.inverses });
            if (stack.length > historyLimit) stack.shift();
          }
          lastDispatchAtRef.current = now;
          redoStackRef.current = [];
        }
      }

      stateRef.current = next;
      setState(next);
      return { result, applied };
    },
    [schema, historyLimit, stateRef, setState, policyRef],
  );

  const applyEntry = useCallback(
    (direction: "undo" | "redo") => {
      const fromStack = direction === "undo" ? undoStackRef.current : redoStackRef.current;
      const toStack = direction === "undo" ? redoStackRef.current : undoStackRef.current;
      const entry = fromStack.pop();
      if (!entry) return null;
      const ops = direction === "undo" ? entry.inverse : entry.forward;
      const { state: next, result, applied } = applyPatch(schema, stateRef.current, ops);
      if (!result.ok) return null;
      toStack.push(entry);
      lastDispatchAtRef.current = 0; // 다음 dispatch 는 새 entry 로
      stateRef.current = next;
      setState(next);
      return { next, applied };
    },
    [schema, stateRef, setState],
  );

  const clear = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
  }, []);

  return {
    dispatch,
    applyEntry,
    canUndo: () => undoStackRef.current.length > 0,
    canRedo: () => redoStackRef.current.length > 0,
    clear,
  };
}
