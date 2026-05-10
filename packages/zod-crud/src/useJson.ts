// SPEC.md §5.1 — 유일한 React 진입점.
// 코어는 src/core/patch.ts (pure). 이 파일은 useState + ops binding + Axis 2 subscribe.

import { useCallback, useMemo, useRef, useState } from "react";
import type * as z from "zod";

import {
  applyOperation,
  applyPatch,
  computeInverses,
  type JsonPatchOperation,
  type JsonResult,
} from "./core/patch.js";
import type { Pointer } from "./core/pointer.js";
import type { PointerOf, ValueAt } from "./core/path-types.js";

export interface UseJsonOptions {
  history?: number;
  strict?: boolean;
  onError?: (error: JsonCrudError) => void;
}

export type JsonChangeListener = (applied: ReadonlyArray<JsonPatchOperation>) => void;

export interface JsonOps<T> {
  add<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JsonResult;
  remove<P extends PointerOf<T>>(path: P): JsonResult;
  replace<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JsonResult;
  move<F extends PointerOf<T>, P extends PointerOf<T>>(from: F, path: P): JsonResult;
  copy<F extends PointerOf<T>, P extends PointerOf<T>>(from: F, path: P): JsonResult;
  test<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JsonResult;

  patch(operations: ReadonlyArray<JsonPatchOperation>): JsonResult;

  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;

  load(value: T): JsonResult;
  reset(value?: T): void;

  /** SPEC §0.2 (9) — Axis 2 hook 들이 op 적용 알림을 받기 위한 구독. */
  subscribe(listener: JsonChangeListener): () => void;
  /** 현재 state 의 read-only snapshot. Axis 2 hook 의 filter/recover 콜백에서 사용. */
  readonly state: T;
}

export class JsonCrudError extends Error {
  override readonly name = "JsonCrudError";
  constructor(
    public readonly op: JsonPatchOperation | "load" | "reset" | "patch",
    public readonly result: Extract<JsonResult, { ok: false }>,
  ) {
    super(`useJson failed: ${result.code}${result.reason ? ` — ${result.reason}` : ""}`);
  }
}

declare const process: { env?: { NODE_ENV?: string } } | undefined;
const isProd = ((): boolean => {
  try {
    return typeof process !== "undefined" && process?.env?.NODE_ENV === "production";
  } catch {
    return false;
  }
})();

const ROOT_REPLACE = (value: unknown): JsonPatchOperation => ({ op: "replace", path: "", value });

export function useJson<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options: UseJsonOptions = {},
): [z.output<S>, JsonOps<z.output<S>>] {
  const optsRef = useRef(options);
  optsRef.current = options;

  const [initialParsed] = useState(() => {
    const parsed = schema.safeParse(initial);
    if (!parsed.success) throw parsed.error;
    return parsed.data as z.output<S>;
  });
  const initialRef = useRef(initialParsed);

  const [state, setState] = useState<z.output<S>>(initialParsed);
  const stateRef = useRef(state);
  stateRef.current = state;

  const historyLimit = options.history ?? 0;
  // 각 entry = { forward, inverse }. forward 는 redo 시 다시 적용, inverse 는 undo 시 적용.
  // 적용 순서: forward 는 그대로, inverse 는 그대로 (computeInverses 가 reverse 로 쌓아둠).
  interface HistoryEntry { forward: JsonPatchOperation[]; inverse: JsonPatchOperation[] }
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const lastDispatchAtRef = useRef<number>(0);
  const COALESCE_MS = 500;

  const listenersRef = useRef<Set<JsonChangeListener>>(new Set());
  const notify = useCallback((applied: ReadonlyArray<JsonPatchOperation>) => {
    if (applied.length === 0) return;
    for (const fn of listenersRef.current) fn(applied);
  }, []);

  const handle = useCallback(
    (op: JsonPatchOperation | "load" | "reset" | "patch", result: JsonResult): JsonResult => {
      if (result.ok) return result;
      const strict = optsRef.current.strict ?? !isProd;
      if (optsRef.current.onError) {
        optsRef.current.onError(new JsonCrudError(op, result));
      }
      if (strict) {
        throw new JsonCrudError(op, result);
      }
      return result;
    },
    [],
  );

  const dispatch = useCallback(
    (label: JsonPatchOperation | "patch", ops: ReadonlyArray<JsonPatchOperation>): JsonResult => {
      const before = stateRef.current;
      const { state: next, result, applied } = applyPatch(schema, before, ops);
      if (!result.ok) return handle(label, result);
      if (next === before) return result;

      if (historyLimit > 0) {
        const inv = computeInverses(before, applied);
        if (inv.ok) {
          const stack = undoStackRef.current;
          const now = Date.now();
          const last = stack[stack.length - 1];
          // 같은 시간 창 안의 입력은 직전 entry 에 합친다 — 빠른 타이핑 = 1 undo.
          if (last && now - lastDispatchAtRef.current < COALESCE_MS) {
            last.forward.push(...applied);
            // inverse 는 이전 inverse 의 앞에 prepend (시간 역순)
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
      notify(applied);
      return result;
    },
    [schema, historyLimit, handle, notify],
  );

  const ops = useMemo<JsonOps<z.output<S>>>(() => {
    const single = (op: JsonPatchOperation): JsonResult => dispatch(op, [op]);
    const obj: JsonOps<z.output<S>> = {
      add(path, value) { return single({ op: "add", path, value }); },
      remove(path) { return single({ op: "remove", path }); },
      replace(path, value) { return single({ op: "replace", path, value }); },
      move(from, path) { return single({ op: "move", from, path }); },
      copy(from, path) { return single({ op: "copy", from, path }); },
      test(path, value) {
        const r = applyOperation(schema, stateRef.current, { op: "test", path, value });
        return handle({ op: "test", path, value }, r.result);
      },
      patch(operations) { return dispatch("patch", operations); },

      undo() {
        const entry = undoStackRef.current.pop();
        if (!entry) return false;
        const { state: next, result, applied } = applyPatch(schema, stateRef.current, entry.inverse);
        if (!result.ok) return false;
        redoStackRef.current.push(entry);
        lastDispatchAtRef.current = 0; // 다음 dispatch 는 새 entry 로
        stateRef.current = next;
        setState(next);
        notify(applied);
        return true;
      },
      redo() {
        const entry = redoStackRef.current.pop();
        if (!entry) return false;
        const { state: next, result, applied } = applyPatch(schema, stateRef.current, entry.forward);
        if (!result.ok) return false;
        undoStackRef.current.push(entry);
        lastDispatchAtRef.current = 0;
        stateRef.current = next;
        setState(next);
        notify(applied);
        return true;
      },
      canUndo() { return undoStackRef.current.length > 0; },
      canRedo() { return redoStackRef.current.length > 0; },

      load(value) {
        const parsed = schema.safeParse(value);
        if (!parsed.success) {
          return handle("load", { ok: false, code: "schema_violation", reason: parsed.error.message });
        }
        const next = parsed.data as z.output<S>;
        const replaceOp = ROOT_REPLACE(next);
        undoStackRef.current = [];
        redoStackRef.current = [];
        stateRef.current = next;
        setState(next);
        notify([replaceOp]);
        return { ok: true };
      },
      reset(value) {
        const target = value ?? initialRef.current;
        const parsed = schema.safeParse(target);
        if (!parsed.success) {
          handle("reset", { ok: false, code: "schema_violation", reason: parsed.error.message });
          return;
        }
        const next = parsed.data as z.output<S>;
        const replaceOp = ROOT_REPLACE(next);
        undoStackRef.current = [];
        redoStackRef.current = [];
        stateRef.current = next;
        setState(next);
        notify([replaceOp]);
      },

      subscribe(listener) {
        listenersRef.current.add(listener);
        return () => { listenersRef.current.delete(listener); };
      },
      get state() { return stateRef.current; },
    };
    return obj;
  }, [dispatch, schema, handle, notify]);

  return [state, ops];
}
