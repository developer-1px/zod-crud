// SPEC.md §5.1 — 유일한 React 진입점.
// 코어는 src/core/patch.ts (pure). 이 파일은 useState + ops binding + Axis 2 subscribe.

import { useCallback, useMemo, useRef, useState } from "react";
import type * as z from "zod";

import {
  applyOperation,
  type JsonPatchOperation,
  type JsonResult,
} from "../core/patch/index.js";
import type { Pointer } from "../core/pointer/index.js";
import type { PointerOf, ValueAt } from "../core/pointer/types.js";
import { handleResult, JsonCrudError, type ErrorPolicy } from "../JsonCrudError.js";
import { useHistoryDispatch } from "./useHistoryDispatch.js";

export { JsonCrudError } from "../JsonCrudError.js";

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

const ROOT_REPLACE = (value: unknown): JsonPatchOperation => ({ op: "replace", path: "", value });

export function useJson<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options: UseJsonOptions = {},
): [z.output<S>, JsonOps<z.output<S>>] {
  const policyRef = useRef<ErrorPolicy>(options);
  policyRef.current = options;

  const [initialParsed] = useState(() => {
    const parsed = schema.safeParse(initial);
    if (!parsed.success) throw parsed.error;
    return parsed.data as z.output<S>;
  });
  const initialRef = useRef(initialParsed);

  const [state, setState] = useState<z.output<S>>(initialParsed);
  const stateRef = useRef(state);
  stateRef.current = state;

  const listenersRef = useRef<Set<JsonChangeListener>>(new Set());
  const notify = useCallback((applied: ReadonlyArray<JsonPatchOperation>) => {
    if (applied.length === 0) return;
    for (const fn of listenersRef.current) fn(applied);
  }, []);

  const history = useHistoryDispatch(schema, stateRef, setState, policyRef, options.history ?? 0);

  const ops = useMemo<JsonOps<z.output<S>>>(() => {
    const dispatch = (label: JsonPatchOperation | "patch", list: ReadonlyArray<JsonPatchOperation>): JsonResult => {
      const { result, applied } = history.dispatch(label, list);
      if (result.ok) notify(applied);
      return result;
    };
    const single = (op: JsonPatchOperation) => dispatch(op, [op]);

    const replaceRoot = (label: "load" | "reset", value: unknown): JsonResult => {
      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        return handleResult(policyRef.current, label, {
          ok: false, code: "schema_violation", reason: parsed.error.message,
        });
      }
      const next = parsed.data as z.output<S>;
      const replaceOp = ROOT_REPLACE(next);
      history.clear();
      stateRef.current = next;
      setState(next);
      notify([replaceOp]);
      return { ok: true };
    };

    return {
      add(path, value) { return single({ op: "add", path, value }); },
      remove(path) { return single({ op: "remove", path }); },
      replace(path, value) { return single({ op: "replace", path, value }); },
      move(from, path) { return single({ op: "move", from, path }); },
      copy(from, path) { return single({ op: "copy", from, path }); },
      test(path, value) {
        const r = applyOperation(schema, stateRef.current, { op: "test", path, value });
        return handleResult(policyRef.current, { op: "test", path, value }, r.result);
      },
      patch(operations) { return dispatch("patch", operations); },

      undo() {
        const out = history.applyEntry("undo");
        if (!out) return false;
        notify(out.applied);
        return true;
      },
      redo() {
        const out = history.applyEntry("redo");
        if (!out) return false;
        notify(out.applied);
        return true;
      },
      canUndo: history.canUndo,
      canRedo: history.canRedo,

      load(value) { return replaceRoot("load", value); },
      reset(value) { replaceRoot("reset", value ?? initialRef.current); },

      subscribe(listener) {
        listenersRef.current.add(listener);
        return () => { listenersRef.current.delete(listener); };
      },
      get state() { return stateRef.current; },
    };
  }, [schema, history, notify]);

  return [state, ops];
}
